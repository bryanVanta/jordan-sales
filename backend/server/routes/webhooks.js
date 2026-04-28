/**
 * Inbound Email Webhook Route
 * Receives incoming emails from Resend and stores them in Firestore
 */

const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const resendService = require('../services/resendService');
const { processInboundAutoReply } = require('../services/autoReplyService');
const { maybeStoreInboundMedia } = require('../services/mediaStorageService');
const { transcribeAudioUrl } = require('../services/elevenLabsSttService');

/**
 * POST /api/webhooks/inbound-email
 * Webhook endpoint to receive inbound emails from Resend
 * Body should contain: from, to, subject, text, html, messageId, timestamp
 */
router.post('/inbound-email', async (req, res) => {
  try {
    const emailData = req.body;
    
    console.log(`[Webhook] Received inbound email from ${emailData.from} to ${emailData.to}`);
    console.log(`[Webhook] Full email data:`, JSON.stringify(emailData, null, 2));

    // Process the inbound email
    const inboundEmail = await resendService.processInboundEmail(emailData);

    // Find the lead by email address - try multiple field names
    const leadsRef = db.collection('leads');
    let leadId = null;
    let leadData = null;

    // Try different field names to find the lead
    const fieldNamesToTry = ['email', 'contactEmail', 'personEmail'];
    
    for (const fieldName of fieldNamesToTry) {
      if (leadId) break; // If we found a lead, stop searching
      
      try {
        console.log(`[Webhook] Searching for lead with ${fieldName} = ${inboundEmail.sender}`);
        const querySnapshot = await leadsRef
          .where(fieldName, '==', inboundEmail.sender)
          .limit(1)
          .get();

        if (!querySnapshot.empty) {
          leadId = querySnapshot.docs[0].id;
          leadData = querySnapshot.docs[0].data();
          console.log(`[Webhook] ✅ Found matching lead using ${fieldName}: ${leadId}`, leadData);
          break;
        }
      } catch (fieldError) {
        console.warn(`[Webhook] Field ${fieldName} search failed:`, fieldError.message);
      }
    }

    if (!leadId) {
      console.warn(`[Webhook] ⚠️ No lead found for email: ${inboundEmail.sender}. Creating record without lead association.`);
    }

    // Save inbound email to Firestore
    const inboundRecord = await db.collection('inbound_emails').add({
      leadId: leadId || null,
      company: leadData?.company || 'Unknown',
      contactPerson: leadData?.contactPerson || 'Unknown',
      contactEmail: inboundEmail.sender,
      channel: 'email', // Explicitly set channel to email for inbound emails
      subject: inboundEmail.subject,
      content: inboundEmail.content,
      messageId: inboundEmail.messageId,
      replyTo: inboundEmail.replyTo,
      status: 'received',
      timestamp: new Date(inboundEmail.timestamp),
      createdAt: new Date(),
      source: 'resend',
    });

    console.log(`[Webhook] Inbound email saved to Firestore: ${inboundRecord.id}`);

    // Also save as a message in outreach_history for chat display
    await db.collection('outreach_history').add({
      leadId: leadId || null,
      company: leadData?.company || 'Unknown',
      contactPerson: leadData?.contactPerson || 'Unknown',
      contactEmail: inboundEmail.sender,
      channel: 'email',
      messageSubject: `Re: ${inboundEmail.subject}`,
      messageContent: inboundEmail.content,
      messagePreview: inboundEmail.content.substring(0, 200),
      status: 'received',
      messageId: inboundEmail.messageId,
      type: 'inbound_reply',
      timestamp: new Date(inboundEmail.timestamp),
      createdAt: new Date(),
    });

    console.log(`[Webhook] Inbound email also saved to outreach_history for chat display`);

    if (leadId) {
      processInboundAutoReply({
        leadId,
        channel: 'email',
        inboundMessage: inboundEmail.content,
        inboundSubject: inboundEmail.subject,
        sender: inboundEmail.sender,
        inboundMessageId: inboundEmail.messageId,
      })
        .then((result) => {
          if (result?.skipped) {
            console.log(`[Webhook] Email auto-reply skipped for lead ${leadId}: ${result.reason}`);
          } else {
            console.log(`[Webhook] Email auto-reply sent for lead ${leadId}`);
          }
        })
        .catch((err) => console.error(`[Webhook] Error running email auto-reply:`, err.message));
    }

    res.json({
      success: true,
      message: 'Inbound email processed and stored',
      recordId: inboundRecord.id,
    });
  } catch (error) {
    console.error('[Webhook] Error processing inbound email:', error);
    res.status(500).json({
      error: 'Failed to process inbound email',
      details: error.message,
    });
  }
});

/**
 * POST /api/webhooks/inbound-whatsapp
 * Webhook endpoint to receive inbound WhatsApp messages (Twilio/OpenClaw-normalized)
 *
 * Accepts either:
 * - Twilio webhook fields: { From, To, Body, MessageSid, ProfileName }
 * - Normalized JSON: { from, to, body, messageId, timestamp, media?, transcript? }
 */
router.post('/inbound-whatsapp', async (req, res) => {
  try {
    const expectedToken = (process.env.INBOUND_WHATSAPP_WEBHOOK_TOKEN || '').trim();
    // Treat placeholder as "disabled" so local/dev setups don't accidentally 401.
    const tokenEnabled = expectedToken && expectedToken.toLowerCase() !== 'change-me';
    if (tokenEnabled) {
      const authHeader = String(req.headers.authorization || '').trim();
      const bearer = authHeader.toLowerCase().startsWith('bearer ') ? authHeader.slice(7).trim() : '';
      if (!bearer || bearer !== expectedToken) {
        console.warn('[Webhook] Inbound WhatsApp unauthorized request');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    const payload = req.body || {};
    const debugInbound = String(process.env.INBOUND_WHATSAPP_DEBUG || '').trim() === '1';
    console.log('[Webhook] Inbound WhatsApp webhook hit:', {
      keys: Object.keys(payload),
      hasFrom: Boolean(payload.from || payload.From),
      hasBody: Boolean(payload.body || payload.Body),
      hasMedia: Boolean(payload.media || payload.NumMedia || payload.numMedia),
    });

    const body = payload.body || payload.Body || '';
    const fromRaw = payload.from || payload.From || '';
    const toRaw = payload.to || payload.To || '';
    const messageId = payload.messageId || payload.MessageSid || payload.id || null;
    const timestamp = payload.timestamp ? new Date(payload.timestamp) : new Date();
    const transcriptRaw = payload.transcript || payload.Transcript || payload?.media?.transcript || '';

    const normalizeTwilioMedia = (input) => {
      const numRaw = input?.NumMedia ?? input?.numMedia ?? input?.num_media ?? 0;
      const num = Number(numRaw);
      if (!Number.isFinite(num) || num <= 0) return null;

      const items = [];
      for (let idx = 0; idx < Math.min(10, Math.floor(num)); idx++) {
        const url = input?.[`MediaUrl${idx}`] || input?.[`mediaUrl${idx}`] || '';
        const mimeType = input?.[`MediaContentType${idx}`] || input?.[`mediaContentType${idx}`] || '';
        if (!url) continue;
        items.push({
          kind: mimeType && String(mimeType).toLowerCase().startsWith('audio/') ? 'audio' : 'unknown',
          url: String(url),
          mimeType: mimeType ? String(mimeType) : undefined,
          provider: 'twilio',
        });
      }

      return items.length ? items : null;
    };

    const normalizeForwardedMedia = (input) => {
      if (!input) return null;
      if (Array.isArray(input)) return input;
      if (typeof input === 'object') return input;
      return null;
    };

    let media = normalizeForwardedMedia(payload.media) || normalizeTwilioMedia(payload);
    const transcript = String(transcriptRaw || '').trim() || (typeof media === 'object' ? String(media?.transcript || '').trim() : '');

    const resolvedBodyRaw = String(body || '').trim();
    const placeholderMatch = resolvedBodyRaw.match(/^<\s*media\s*:\s*(image|audio)\s*>$/i);

    if (!media && placeholderMatch && placeholderMatch[1]) {
      media = {
        kind: String(placeholderMatch[1]).toLowerCase(),
        provider: payload.Body ? 'twilio' : 'openclaw',
      };
    }
    const isPlaceholderText = (value) => {
      const v = String(value || '').trim();
      if (!v) return false;
      return /^<\s*media\s*:\s*(image|audio)\s*>$/i.test(v) || /^\[media\]$/i.test(v);
    };

    const summarizeMedia = (value) => {
      if (!value) return null;
      const items = Array.isArray(value) ? value : typeof value === 'object' ? [value] : [];
      return items.slice(0, 4).map((item) => ({
        kind: item?.kind || null,
        hasUrl: Boolean(item?.url),
        mimeType: item?.mimeType || item?.mimetype || null,
        provider: item?.provider || null,
        fileName: item?.fileName || item?.filename || item?.name || null,
      }));
    };

    if (debugInbound && (placeholderMatch || media)) {
      console.log('[Webhook] Inbound WhatsApp media debug:', {
        placeholder: placeholderMatch ? placeholderMatch[1] : null,
        hasTranscript: Boolean(transcript),
        mediaSummary: summarizeMedia(media),
        cloudinaryConfigured: Boolean(
          process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET
        ),
      });
    }

    let resolvedBody = resolvedBodyRaw || transcript || (media ? '[Media]' : '');
    if (placeholderMatch && media) {
      // Prefer rendering the attachment instead of showing placeholder text.
      resolvedBody = transcript || '[Media]';
    }

    const normalizeWhatsAppNumber = (value) => {
      const v = String(value || '').trim();
      if (!v) return '';
      const withoutPrefix = v.startsWith('whatsapp:') ? v.slice('whatsapp:'.length) : v;
      if (withoutPrefix.startsWith('+')) return withoutPrefix;
      const digits = withoutPrefix.replace(/[^\d]/g, '');
      return digits ? `+${digits}` : '';
    };

    const from = normalizeWhatsAppNumber(fromRaw);
    const to = normalizeWhatsAppNumber(toRaw);

    if (!from || (!resolvedBody && !media)) {
      return res.status(400).json({ error: 'Missing required fields: from, body' });
    }

    console.log(`[Webhook] Received inbound WhatsApp from ${from} to ${to || 'N/A'}`);

    // OpenClaw can emit multiple lifecycle events for the same inbound message.
    // Treat dedupe as best-effort so lookup issues never block storing the inbound.
    const inboundRef = db.collection('inbound_whatsapp');

    const normalizeMediaList = (value) => {
      if (!value) return [];
      if (Array.isArray(value)) return value.filter(Boolean);
      if (typeof value === 'object') return [value];
      return [];
    };

    const shouldBackfillDuplicate = (existingData, incomingMediaValue, incomingTranscriptValue, incomingBodyText) => {
      const existingMedia = existingData?.media || null;
      const incomingMedia = incomingMediaValue || null;

      const incomingMediaList = normalizeMediaList(incomingMedia);
      const existingMediaList = normalizeMediaList(existingMedia);

      const incomingHasUsableMedia = incomingMediaList.some(
        (m) => Boolean(String(m?.url || '').trim()) || Boolean(String(m?.mimeType || m?.mimetype || '').trim())
      );
      const existingHasUsableMedia = existingMediaList.some(
        (m) => Boolean(String(m?.url || '').trim()) || Boolean(String(m?.mimeType || m?.mimetype || '').trim())
      );

      const incomingUrls = incomingMediaList.map((m) => String(m?.url || '').trim()).filter(Boolean);
      const existingUrls = existingMediaList.map((m) => String(m?.url || '').trim()).filter(Boolean);

      const existingTranscript = String(existingData?.transcript || '').trim();
      const existingContent = String(existingData?.content || '').trim();

      if (incomingHasUsableMedia && !existingHasUsableMedia) return true;
      if (incomingUrls.length > 0 && existingUrls.length === 0) return true;
      if (incomingUrls.length > 0 && incomingUrls.some((u) => !existingUrls.includes(u))) return true;
      if (incomingTranscriptValue && !existingTranscript) return true;
      if (incomingBodyText && isPlaceholderText(existingContent) && !isPlaceholderText(incomingBodyText)) return true;
      return false;
    };

    const backfillDuplicateBestEffort = (existingDocSnap, existingData) => {
      if (!existingDocSnap || !existingDocSnap.ref) return;
      const docRef = existingDocSnap.ref;
      if (!shouldBackfillDuplicate(existingData, media, transcript, resolvedBody)) return;

      setImmediate(async () => {
        try {
          const storedMedia = await maybeStoreInboundMedia({ media }).catch(() => media || null);

          const patch = {
            ...(storedMedia ? { media: storedMedia } : {}),
            ...(transcript ? { transcript } : {}),
            ...(resolvedBody ? { content: String(resolvedBody) } : {}),
            updatedAt: new Date(),
          };

          await docRef.update(patch).catch(() => {});

          try {
            const outreachRef = db.collection('outreach_history');
            const messageIdValue = String(existingData?.messageId || '').trim();
            let mirrorDoc = null;

            if (messageIdValue) {
              const snap = await outreachRef.where('messageId', '==', messageIdValue).limit(1).get();
              if (!snap.empty) mirrorDoc = snap.docs[0];
            }

            if (!mirrorDoc) {
              const existingSnapshot = await outreachRef.orderBy('createdAt', 'desc').limit(75).get();
              mirrorDoc =
                existingSnapshot.docs.find((doc) => {
                  const data = doc.data() || {};
                  if (String(data.channel || '') !== 'whatsapp') return false;
                  if (String(data.status || '') !== 'received') return false;
                  if (String(data.contactWhatsApp || '') !== String(from)) return false;
                  const existingBody = String(data.messageContent || '').trim();
                  return isPlaceholderText(existingBody) || existingBody === String(existingData?.content || '').trim();
                }) || null;
            }

            if (mirrorDoc) {
              await mirrorDoc.ref.update({
                ...(storedMedia ? { media: storedMedia } : {}),
                ...(transcript ? { transcript } : {}),
                ...(resolvedBody ? { messageContent: String(resolvedBody), messagePreview: String(resolvedBody).substring(0, 200) } : {}),
                updatedAt: new Date(),
              });
            }
          } catch {
            // ignore mirror backfill
          }

          if (debugInbound) {
            const storedUrls = Array.isArray(patch.media)
              ? patch.media.map((m) => m?.url).filter(Boolean)
              : patch.media?.url
                ? [patch.media.url]
                : [];
            console.log('[Webhook] Duplicate inbound backfilled media:', { recordId: existingDocSnap.id, storedUrls: storedUrls.slice(0, 3) });
          }
        } catch (error) {
          if (debugInbound) console.warn('[Webhook] Duplicate inbound backfill failed:', error?.message || String(error));
        }
      });
    };

    const triggerAutoReplyBestEffort = ({ leadId, bodyText, senderNumber, messageIdValue }) => {
      if (!leadId) return;

      processInboundAutoReply({
        leadId: String(leadId),
        channel: 'whatsapp',
        inboundMessage: String(bodyText || ''),
        sender: String(senderNumber || ''),
        inboundMessageId: messageIdValue ? String(messageIdValue) : '',
      })
        .then((result) => {
          if (result?.skipped) {
            console.log(`[Webhook] WhatsApp auto-reply skipped for lead ${leadId}: ${result.reason}`);
          } else {
            console.log(`[Webhook] WhatsApp auto-reply sent for lead ${leadId}`);
          }
        })
        .catch((err) => console.error(`[Webhook] Error running WhatsApp auto-reply:`, err.message));
    };
    try {
      if (messageId) {
        const existingByMessageId = await inboundRef.where('messageId', '==', messageId).limit(1).get();
        if (!existingByMessageId.empty) {
          console.log(`[Webhook] Duplicate inbound WhatsApp ignored via messageId: ${messageId}`);
          const existingDoc = existingByMessageId.docs[0];
          const existingData = existingDoc.data() || {};
          backfillDuplicateBestEffort(existingDoc, existingData);
          return res.json({ success: true, duplicate: true, recordId: existingDoc.id });
        }

        // Some gateways generate different IDs across lifecycle events; apply recent-body dedupe too.
        // IMPORTANT: Avoid composite-index requirements by querying recent docs by time only and filtering in-memory.
        const recentSnapshot = await inboundRef.orderBy('createdAt', 'desc').limit(50).get();
        const incomingBody = String(resolvedBody).trim();
        const duplicateRecent = recentSnapshot.docs.find((doc) => {
          const data = doc.data();
          if (String(data.contactWhatsApp || '') !== String(from)) return false;
          const existingBody = String(data.content || '').trim();
          const createdAt = data.createdAt?.toDate?.();
          const ageMs = createdAt instanceof Date ? Math.abs(Date.now() - createdAt.getTime()) : Number.POSITIVE_INFINITY;
          // Only treat as duplicate when it's truly a gateway retry; keep the window tight so users
          // can legitimately send the same text twice without it being dropped.
          return existingBody === incomingBody && ageMs <= 10 * 1000;
        });

        if (duplicateRecent) {
          console.log(`[Webhook] Duplicate inbound WhatsApp ignored via recent match: ${duplicateRecent.id}`);
          const existingData = duplicateRecent.data() || {};
          backfillDuplicateBestEffort(duplicateRecent, existingData);
          return res.json({ success: true, duplicate: true, recordId: duplicateRecent.id });
        }
      } else {
        // IMPORTANT: Avoid composite-index requirements by querying recent docs by time only and filtering in-memory.
        const recentSnapshot = await inboundRef.orderBy('createdAt', 'desc').limit(50).get();

        const incomingBody = String(resolvedBody).trim();
        const duplicateRecent = recentSnapshot.docs.find((doc) => {
          const data = doc.data();
          if (String(data.contactWhatsApp || '') !== String(from)) return false;
          const existingBody = String(data.content || '').trim();
          const createdAt = data.createdAt?.toDate?.();
          const ageMs = createdAt instanceof Date ? Math.abs(Date.now() - createdAt.getTime()) : Number.POSITIVE_INFINITY;
          return existingBody === incomingBody && ageMs <= 10 * 1000;
        });

        if (duplicateRecent) {
          console.log(`[Webhook] Duplicate inbound WhatsApp ignored via recent match: ${duplicateRecent.id}`);
          const existingData = duplicateRecent.data() || {};
          backfillDuplicateBestEffort(duplicateRecent, existingData);
          return res.json({ success: true, duplicate: true, recordId: duplicateRecent.id });
        }
      }
    } catch (dedupeError) {
      console.warn('[Webhook] Inbound WhatsApp dedupe check failed, continuing with save:', dedupeError.message);
    }

    const leadsRef = db.collection('leads');
    let leadId = null;
    let leadData = null;

    // Try whatsapp first, then phone fields
    const fieldNamesToTry = ['whatsapp', 'phone', 'contactPhone', 'contactWhatsApp'];
    const fromDigits = from.replace(/[^\d]/g, '');
    const candidateValues = Array.from(
      new Set(
        [
          from,
          `whatsapp:${from}`,
          fromDigits ? `+${fromDigits}` : null,
          fromDigits || null,
        ].filter(Boolean)
      )
    ).slice(0, 10);

    for (const fieldName of fieldNamesToTry) {
      if (leadId) break;
      try {
        const querySnapshot = await leadsRef.where(fieldName, 'in', candidateValues).limit(1).get();
        if (!querySnapshot.empty) {
          leadId = querySnapshot.docs[0].id;
          leadData = querySnapshot.docs[0].data();
          console.log(`[Webhook] ✅ Found matching lead using ${fieldName}: ${leadId}`);
          break;
        }
      } catch (fieldError) {
        console.warn(`[Webhook] Field ${fieldName} search failed:`, fieldError.message);
      }
    }

    if (!leadId) {
      console.warn(`[Webhook] ⚠️ No lead found for WhatsApp: ${from}. Storing without lead association.`);
    }

    const storedMedia = await maybeStoreInboundMedia({ media }).catch(() => media || null);

    if (debugInbound && media) {
      const originalUrls = Array.isArray(media) ? media.map((m) => m?.url).filter(Boolean) : [media?.url].filter(Boolean);
      const storedUrls = Array.isArray(storedMedia) ? storedMedia.map((m) => m?.url).filter(Boolean) : [storedMedia?.url].filter(Boolean);
      console.log('[Webhook] Inbound WhatsApp media stored:', {
        originalUrls: originalUrls.slice(0, 3),
        storedUrls: storedUrls.slice(0, 3),
        changed: JSON.stringify(originalUrls) !== JSON.stringify(storedUrls),
      });
    }

    const inboundRecord = await inboundRef.add({
      leadId: leadId || null,
      company: leadData?.company || 'Unknown',
      contactPerson: leadData?.person || leadData?.contactPerson || 'Unknown',
      contactWhatsApp: from,
      channel: 'whatsapp',
      content: String(resolvedBody),
      messageId,
      status: 'received',
      timestamp,
      createdAt: new Date(),
      source: payload.Body ? 'twilio' : 'openclaw',
      ...(storedMedia ? { media: storedMedia } : {}),
      ...(transcript ? { transcript } : {}),
    });

    console.log(`[Webhook] Inbound WhatsApp saved: ${inboundRecord.id} (leadId=${leadId || 'none'})`);

    // Also add to outreach_history for chat display (best-effort dedupe).
    try {
      const outreachRef = db.collection('outreach_history');
      const incomingBody = String(resolvedBody).trim();
      // IMPORTANT: Avoid composite-index requirements and undefined ordering by querying recent docs by time only.
      const existingSnapshot = await outreachRef.orderBy('createdAt', 'desc').limit(75).get();
      const duplicateMirror = existingSnapshot.docs.find((doc) => {
        const data = doc.data() || {};
        if (String(data.leadId || null) !== String(leadId || null)) return false;
        if (String(data.channel || '') !== 'whatsapp') return false;
        if (String(data.status || '') !== 'received') return false;
        if (String(data.contactWhatsApp || '') !== String(from)) return false;
        const existingBody = String(data.messageContent || '').trim();
        const createdAt = data.createdAt?.toDate?.();
        const ageMs = createdAt instanceof Date ? Math.abs(Date.now() - createdAt.getTime()) : Number.POSITIVE_INFINITY;
        return existingBody === incomingBody && ageMs <= 10 * 1000;
      });

      if (duplicateMirror) {
        console.log(`[Webhook] Duplicate inbound WhatsApp mirror ignored in outreach_history: ${duplicateMirror.id}`);
      } else {
        await outreachRef.add({
          leadId: leadId || null,
          company: leadData?.company || 'Unknown',
          contactPerson: leadData?.person || leadData?.contactPerson || 'Unknown',
          contactWhatsApp: from,
          contactPhone: leadData?.phone || null,
          channel: 'whatsapp',
          messageSubject: null,
          messageContent: String(resolvedBody),
          messagePreview: String(resolvedBody).substring(0, 200),
          status: 'received',
          messageId,
          type: 'inbound_reply',
          source: payload.Body ? 'twilio' : 'openclaw',
          timestamp,
          createdAt: new Date(),
          ...(storedMedia ? { media: storedMedia } : {}),
          ...(transcript ? { transcript } : {}),
        });
      }
    } catch (mirrorError) {
      console.warn('[Webhook] Failed mirroring inbound WhatsApp into outreach_history:', mirrorError.message);
    }

    const storedMediaList = normalizeMediaList(storedMedia || media);
    const audioItem =
      storedMediaList.find((m) => String(m?.kind || '').toLowerCase() === 'audio') ||
      (String(media?.kind || '').toLowerCase() === 'audio' ? media : null);

    const isVoiceWithoutTranscript =
      Boolean(audioItem) && !transcript && /^\[media\]$/i.test(String(resolvedBody || '').trim());

    if (leadId) {
      if (isVoiceWithoutTranscript) {
        // Queue STT in the background (don't block webhook response). If STT succeeds, we can auto-reply
        // using the transcript; otherwise we keep the "needsHumanReply" flag.
        db.collection('leads').doc(leadId).update({ needsHumanReply: true, lastInboundAt: new Date(), lastInboundChannel: 'whatsapp' }).catch(() => {});

        setImmediate(async () => {
          try {
            const audioUrl = String(audioItem?.url || '').trim();
            if (!audioUrl) return;

            const stt = await transcribeAudioUrl({
              audioUrl,
              fileName: audioItem?.fileName || 'voice-note.ogg',
              mimeType: audioItem?.mimeType || 'audio/ogg',
              languageCode: null,
              diarize: false,
              tagAudioEvents: true,
            });
            const transcriptText = String(stt?.text || '').trim();
            if (!transcriptText) {
              console.log(`[Webhook] Voice note STT failed/empty for lead ${leadId}: ${stt?.error || 'empty'}`);
              return;
            }

            console.log(`[Webhook] Voice note STT ok for lead ${leadId}: ${transcriptText.slice(0, 80)}`);

            // Patch inbound_whatsapp + outreach_history mirrors with transcript so UI can display it.
            await inboundRecord.update({ transcript: transcriptText, content: transcriptText, updatedAt: new Date() }).catch(() => {});
            try {
              const outreachRef = db.collection('outreach_history');
              const mirror = await outreachRef.where('messageId', '==', messageId || '').limit(1).get();
              if (!mirror.empty) {
                await mirror.docs[0].ref.update({
                  transcript: transcriptText,
                  messageContent: transcriptText,
                  messagePreview: transcriptText.substring(0, 200),
                  updatedAt: new Date(),
                });
              }
            } catch {
              // ignore mirror patch
            }

            // Now that we have transcript, run auto-reply.
            db.collection('leads').doc(leadId).update({ aiTyping: true, aiTypingStartedAt: new Date() }).catch(() => {});
            processInboundAutoReply({
              leadId,
              channel: 'whatsapp',
              inboundMessage: transcriptText,
              sender: from,
              inboundMessageId: messageId || '',
            })
              .then((result) => {
                if (result?.skipped) {
                  console.log(`[Webhook] WhatsApp auto-reply skipped for lead ${leadId}: ${result.reason}`);
                } else {
                  console.log(`[Webhook] WhatsApp auto-reply sent for lead ${leadId}`);
                }
              })
              .catch((err) => console.error(`[Webhook] Error running WhatsApp auto-reply (post-STT):`, err.message))
              .finally(() => {
                db.collection('leads').doc(leadId).update({ aiTyping: false, needsHumanReply: false }).catch(() => {});
              });
          } catch (err) {
            console.warn('[Webhook] Voice note STT background task failed:', err?.message || String(err));
          }
        });

        console.log(`[Webhook] Voice note received without transcript; queued STT for lead ${leadId}`);
      } else {
        // Signal to the chat UI that the AI is composing a reply.
        db.collection('leads').doc(leadId).update({ aiTyping: true, aiTypingStartedAt: new Date() })
          .catch(() => {}); // best-effort, never block the webhook response

        processInboundAutoReply({
          leadId,
          channel: 'whatsapp',
          inboundMessage: String(resolvedBody),
          sender: from,
          inboundMessageId: messageId || '',
        })
          .then((result) => {
            if (result?.skipped) {
              console.log(`[Webhook] WhatsApp auto-reply skipped for lead ${leadId}: ${result.reason}`);
            } else {
              console.log(`[Webhook] WhatsApp auto-reply sent for lead ${leadId}`);
            }
          })
          .catch((err) => console.error(`[Webhook] Error running WhatsApp auto-reply:`, err.message))
          .finally(() => {
            db.collection('leads').doc(leadId).update({ aiTyping: false }).catch(() => {});
          });
      }
    }

    res.json({ success: true, recordId: inboundRecord.id });
  } catch (error) {
    console.error('[Webhook] Error processing inbound WhatsApp:', error);
    res.status(500).json({ error: 'Failed to process inbound WhatsApp', details: error.message });
  }
});

/**
 * GET /api/webhooks/debug/inbound-whatsapp
 * Debug endpoint to view inbound WhatsApp records stored
 */
router.get('/debug/inbound-whatsapp', async (req, res) => {
  try {
    const inboundRef = db.collection('inbound_whatsapp');
    const snapshot = await inboundRef.orderBy('createdAt', 'desc').limit(50).get();

    const messages = [];
    snapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() });
    });

    res.json({ success: true, count: messages.length, messages });
  } catch (error) {
    console.error('[Debug] Error fetching inbound WhatsApp:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks/debug/inbound-emails
 * Debug endpoint to view all inbound emails stored
 */
router.get('/debug/inbound-emails', async (req, res) => {
  try {
    const inboundRef = db.collection('inbound_emails');
    const snapshot = await inboundRef.limit(50).get();
    
    const emails = [];
    snapshot.forEach((doc) => {
      emails.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    console.log(`[Debug] Found ${emails.length} inbound emails`);
    res.json({
      success: true,
      count: emails.length,
      emails: emails,
    });
  } catch (error) {
    console.error('[Debug] Error fetching inbound emails:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks/debug/leads
 * Debug endpoint to view all leads and their email fields
 */
router.get('/debug/leads', async (req, res) => {
  try {
    const leadsRef = db.collection('leads');
    const snapshot = await leadsRef.limit(50).get();
    
    const leads = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      leads.push({
        id: doc.id,
        email: data.email,
        contactEmail: data.contactEmail,
        personEmail: data.personEmail,
        company: data.company || data.companyName,
        person: data.person,
        phone: data.phone,
        whatsapp: data.whatsapp,
      });
    });
    
    console.log(`[Debug] Found ${leads.length} leads`);
    res.json({
      success: true,
      count: leads.length,
      leads: leads,
    });
  } catch (error) {
    console.error('[Debug] Error fetching leads:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/webhooks/debug/conversation/:email
 * Debug endpoint to view conversation for a specific email
 */
router.get('/debug/conversation/:email', async (req, res) => {
  try {
    const email = req.params.email;
    console.log(`[Debug] Fetching conversation for email: ${email}`);
    
    // Fetch outbound messages
    const outreachRef = db.collection('outreach_history');
    const outreachQuery = outreachRef.where('contactEmail', '==', email);
    const outreachSnapshot = await outreachQuery.get();
    
    // Fetch inbound messages
    const inboundRef = db.collection('inbound_emails');
    const inboundQuery = inboundRef.where('contactEmail', '==', email);
    const inboundSnapshot = await inboundQuery.get();
    
    const outbound = [];
    const inbound = [];
    
    outreachSnapshot.forEach((doc) => {
      outbound.push({ id: doc.id, ...doc.data() });
    });
    
    inboundSnapshot.forEach((doc) => {
      inbound.push({ id: doc.id, ...doc.data() });
    });
    
    console.log(`[Debug] Found ${outbound.length} outbound and ${inbound.length} inbound messages`);
    
    res.json({
      success: true,
      email: email,
      outbound: { count: outbound.length, messages: outbound },
      inbound: { count: inbound.length, messages: inbound },
    });
  } catch (error) {
    console.error('[Debug] Error fetching conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
