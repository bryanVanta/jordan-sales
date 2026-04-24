import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';

export type PlatformType = 'email' | 'whatsapp' | 'telegram';

export type MediaAttachment = {
  kind?: 'image' | 'audio' | 'unknown' | string;
  url?: string;
  mimeType?: string;
  fileName?: string;
  durationMs?: number;
  isVoiceNote?: boolean;
  caption?: string;
  transcript?: string;
  provider?: string;
  originalUrl?: string;
  cloudinary?: {
    publicId?: string;
    bytes?: number;
    resourceType?: string;
  };
};

export interface OutreachMessage {
  id: string;
  leadId: string;
  company: string;
  contactPerson: string;
  contactEmail: string;
  contactWhatsApp?: string;
  contactPhone?: string;
  channel: PlatformType;
  messageSubject?: string;
  messageContent: string;
  messagePreview: string;
  status: 'sent' | 'failed' | 'received';
  errorMessage?: string;
  messageId?: string;
  timestamp: Date;
  createdAt: Date;
  media?: MediaAttachment | MediaAttachment[] | null;
  transcript?: string | null;
}

const getMessageTimestamp = (message: OutreachMessage) =>
  message.timestamp?.getTime?.() || message.createdAt?.getTime?.() || 0;

const dedupeConversationMessages = (messages: OutreachMessage[]): OutreachMessage[] => {
  const seen = new Set<string>();

  return messages.filter((message) => {
    const timestampMs = getMessageTimestamp(message);
    const mediaKey = Array.isArray(message.media)
      ? message.media.map((m) => String(m?.url || '')).filter(Boolean).join(',')
      : String((message.media as any)?.url || '');
    const key =
      message.messageId ||
      [
        message.leadId || '',
        message.channel || '',
        message.status || '',
        message.contactWhatsApp || message.contactEmail || '',
        message.messageContent || '',
        mediaKey,
        timestampMs,
      ].join('::');

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * Fetch all conversation messages (sent + received) for a specific lead id and channel
 * Combines outreach_history + inbound_* collections.
 */
export const fetchCompleteConversationByLeadId = async (
  leadId: string,
  channel: PlatformType,
  contactWhatsApp?: string  // Optional: also query by phone number so messages with leadId:null are found
): Promise<OutreachMessage[]> => {
  try {
    const allMessages: OutreachMessage[] = [];
    let hasInboundInOutreachHistory = false;

    // Outbound + any inbound mirrored into outreach_history
    try {
      const outreachRef = collection(db, 'outreach_history');
      const outreachQuery = query(outreachRef, where('leadId', '==', leadId));
      const outreachSnapshot = await getDocs(outreachQuery);

      outreachSnapshot.forEach((doc) => {
        const data: any = doc.data();
        if (data.channel && data.channel !== channel) return;

        if (data.channel === 'whatsapp' && data.status === 'received') {
          hasInboundInOutreachHistory = true;
        }

        allMessages.push({
          id: doc.id,
          leadId: data.leadId || '',
          company: data.company,
          contactPerson: data.contactPerson,
          contactEmail: data.contactEmail,
          contactWhatsApp: data.contactWhatsApp,
          contactPhone: data.contactPhone,
          channel: data.channel,
          messageSubject: data.messageSubject,
          messageContent: data.messageContent,
          messagePreview: data.messagePreview,
          status: data.status,
          errorMessage: data.errorMessage,
          messageId: data.messageId,
          timestamp: data.timestamp?.toDate?.() || new Date(),
          createdAt: data.createdAt?.toDate?.() || new Date(),
          media: data.media ?? null,
          transcript: data.transcript ?? null,
        });
      });
    } catch (error) {
      console.warn('[Outreach Service] Error fetching outreach_history by leadId:', error);
    }

    // Inbound channel-specific collections (optional)
    if (channel === 'email') {
      try {
        const inboundRef = collection(db, 'inbound_emails');
        const inboundQuery = query(inboundRef, where('leadId', '==', leadId));
        const inboundSnapshot = await getDocs(inboundQuery);

        inboundSnapshot.forEach((doc) => {
          const data: any = doc.data();
          allMessages.push({
            id: doc.id,
            leadId: data.leadId || '',
            company: data.company,
            contactPerson: data.contactPerson,
            contactEmail: data.contactEmail,
            channel: 'email' as PlatformType,
            messageSubject: `Re: ${data.subject}`,
            messageContent: data.content,
            messagePreview: data.content?.substring(0, 200) || '',
            status: data.status,
            errorMessage: data.errorMessage,
            messageId: data.messageId,
            timestamp: data.timestamp?.toDate?.() || new Date(),
            createdAt: data.createdAt?.toDate?.() || new Date(),
            media: data.media ?? null,
            transcript: data.transcript ?? null,
          });
        });
      } catch (error) {
        console.warn('[Outreach Service] Error fetching inbound_emails by leadId:', error);
      }
    }

    if (channel === 'whatsapp') {
      // Also query outreach_history by contactWhatsApp to catch messages where leadId may differ
      if (contactWhatsApp) {
        try {
          const outreachRef = collection(db, 'outreach_history');
          const phoneQuery = query(outreachRef, where('contactWhatsApp', '==', contactWhatsApp));
          const phoneSnapshot = await getDocs(phoneQuery);
          phoneSnapshot.forEach((doc) => {
            const data: any = doc.data();
            if (data.channel && data.channel !== 'whatsapp') return;
            if (data.channel === 'whatsapp' && data.status === 'received') {
              hasInboundInOutreachHistory = true;
            }
            allMessages.push({
              id: doc.id,
              leadId: data.leadId || '',
              company: data.company,
              contactPerson: data.contactPerson,
              contactEmail: data.contactEmail || '',
              contactWhatsApp: data.contactWhatsApp,
              contactPhone: data.contactPhone,
              channel: 'whatsapp' as PlatformType,
              messageSubject: null as any,
              messageContent: data.messageContent,
              messagePreview: data.messagePreview || data.messageContent?.substring(0, 200) || '',
              status: data.status,
              errorMessage: data.errorMessage,
              messageId: data.messageId,
              timestamp: data.timestamp?.toDate?.() || new Date(),
              createdAt: data.createdAt?.toDate?.() || new Date(),
              media: data.media ?? null,
              transcript: data.transcript ?? null,
            });
          });
        } catch (error) {
          console.warn('[Outreach Service] Error fetching outreach_history by contactWhatsApp:', error);
        }
      }

      // Query inbound_whatsapp by leadId and (if provided) by phone number
      const inboundDocsById = new Map<string, any>();

      try {
        const inboundRef = collection(db, 'inbound_whatsapp');
        const inboundQuery = query(inboundRef, where('leadId', '==', leadId));
        const inboundSnapshot = await getDocs(inboundQuery);
        inboundSnapshot.forEach((doc) => inboundDocsById.set(doc.id, { id: doc.id, ...doc.data() }));
      } catch (error) {
        console.warn('[Outreach Service] Error fetching inbound_whatsapp by leadId:', error);
      }

      if (contactWhatsApp && !hasInboundInOutreachHistory) {
        try {
          const inboundRef = collection(db, 'inbound_whatsapp');
          const phoneQuery = query(inboundRef, where('contactWhatsApp', '==', contactWhatsApp));
          const phoneSnapshot = await getDocs(phoneQuery);
          phoneSnapshot.forEach((doc) => {
            if (!inboundDocsById.has(doc.id)) inboundDocsById.set(doc.id, { id: doc.id, ...doc.data() });
          });
        } catch (error) {
          console.warn('[Outreach Service] Error fetching inbound_whatsapp by contactWhatsApp:', error);
        }
      }

      if (!hasInboundInOutreachHistory) {
        inboundDocsById.forEach((data) => {
          allMessages.push({
            id: data.id,
            leadId: data.leadId || '',
            company: data.company,
            contactPerson: data.contactPerson,
            contactEmail: data.contactEmail || '',
            contactWhatsApp: data.contactWhatsApp,
            contactPhone: data.contactPhone,
            channel: 'whatsapp' as PlatformType,
            messageSubject: null as any,
            messageContent: data.content,
            messagePreview: data.content?.substring(0, 200) || '',
            status: data.status,
            errorMessage: data.errorMessage,
            messageId: data.messageId,
            timestamp: data.timestamp?.toDate?.() || new Date(),
            createdAt: data.createdAt?.toDate?.() || new Date(),
            media: data.media ?? null,
            transcript: data.transcript ?? null,
          });
        });
      }
    }

    const dedupedMessages = dedupeConversationMessages(allMessages);
    dedupedMessages.sort((a, b) => getMessageTimestamp(a) - getMessageTimestamp(b));
    return dedupedMessages;
  } catch (error) {
    console.error('[Outreach Service] Error fetching conversation by leadId:', error);
    return [];
  }
};

/**
 * Fetch outreach messages by platform
 */
export const fetchOutreachMessages = async (platform: PlatformType): Promise<OutreachMessage[]> => {
  try {
    console.log(`[Outreach Service] Fetching messages for platform: ${platform}`);
    
    const messagesRef = collection(db, 'outreach_history');
    
    let q;
    try {
      // Try with orderBy first
      q = query(
        messagesRef,
        where('channel', '==', platform),
        orderBy('timestamp', 'desc')
      );
    } catch (indexError) {
      // Fallback to just where clause if index doesn't exist
      console.warn('[Outreach Service] OrderBy index not available, using where-only query');
      q = query(
        messagesRef,
        where('channel', '==', platform)
      );
    }

    const querySnapshot = await getDocs(q);
    console.log(`[Outreach Service] Found ${querySnapshot.size} messages for ${platform}`);
    
    const messages: OutreachMessage[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      console.log(`[Outreach Service] Processing doc ${doc.id}:`, {
        channel: data.channel,
        company: data.company,
        timestamp: data.timestamp
      });
      
      messages.push({
        id: doc.id,
        leadId: data.leadId,
        company: data.company,
        contactPerson: data.contactPerson,
        contactEmail: data.contactEmail,
        channel: data.channel,
        messageSubject: data.messageSubject,
        messageContent: data.messageContent,
        messagePreview: data.messagePreview,
        status: data.status,
        errorMessage: data.errorMessage,
        messageId: data.messageId,
        timestamp: data.timestamp?.toDate(),
        createdAt: data.createdAt?.toDate(),
      });
    });

    console.log(`[Outreach Service] Returning ${messages.length} processed messages`);
    return messages;
  } catch (error) {
    console.error(`[Outreach Service] Error fetching ${platform} messages:`, error);
    console.error('[Outreach Service] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Fallback: Try fetching all messages without any filters
    console.log('[Outreach Service] Attempting fallback: fetching all messages...');
    try {
      const messagesRef = collection(db, 'outreach_history');
      const allDocs = await getDocs(messagesRef);
      console.log(`[Outreach Service] Fallback found ${allDocs.size} total documents`);
      
      const allMessages: OutreachMessage[] = [];
      allDocs.forEach((doc) => {
        const data = doc.data();
        if (data.channel === platform) {
          console.log(`[Outreach Service] Fallback found matching doc: ${doc.id}`);
          allMessages.push({
            id: doc.id,
            leadId: data.leadId,
            company: data.company,
            contactPerson: data.contactPerson,
            contactEmail: data.contactEmail,
            channel: data.channel,
            messageSubject: data.messageSubject,
            messageContent: data.messageContent,
            messagePreview: data.messagePreview,
            status: data.status,
            errorMessage: data.errorMessage,
            messageId: data.messageId,
            timestamp: data.timestamp?.toDate(),
            createdAt: data.createdAt?.toDate(),
          });
        }
      });
      
      return allMessages;
    } catch (fallbackError) {
      console.error('[Outreach Service] Fallback also failed:', fallbackError);
      return [];
    }
  }
};

/**
 * Fetch all outreach messages
 */
export const fetchAllOutreachMessages = async (): Promise<OutreachMessage[]> => {
  try {
    const messagesRef = collection(db, 'outreach_history');
    const q = query(messagesRef, orderBy('timestamp', 'desc'));

    const querySnapshot = await getDocs(q);
    const messages: OutreachMessage[] = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      messages.push({
        id: doc.id,
        leadId: data.leadId,
        company: data.company,
        contactPerson: data.contactPerson,
        contactEmail: data.contactEmail,
        channel: data.channel,
        messageSubject: data.messageSubject,
        messageContent: data.messageContent,
        messagePreview: data.messagePreview,
        status: data.status,
        errorMessage: data.errorMessage,
        messageId: data.messageId,
        timestamp: data.timestamp?.toDate(),
        createdAt: data.createdAt?.toDate(),
      });
    });

    return messages;
  } catch (error) {
    console.error('Error fetching outreach messages:', error);
    return [];
  }
};

/**
 * Fetch outreach messages for a specific lead
 */
export const fetchOutreachMessagesByLeadId = async (leadId: string): Promise<OutreachMessage[]> => {
  try {
    console.log(`[Outreach Service] Fetching messages for lead: ${leadId}`);
    
    const messagesRef = collection(db, 'outreach_history');
    
    try {
      const q = query(
        messagesRef,
        where('leadId', '==', leadId),
        orderBy('timestamp', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const messages: OutreachMessage[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          leadId: data.leadId,
          company: data.company,
          contactPerson: data.contactPerson,
          contactEmail: data.contactEmail,
          channel: data.channel,
          messageSubject: data.messageSubject,
          messageContent: data.messageContent,
          messagePreview: data.messagePreview,
          status: data.status,
          errorMessage: data.errorMessage,
          messageId: data.messageId,
          timestamp: data.timestamp?.toDate(),
          createdAt: data.createdAt?.toDate(),
        });
      });
      
      console.log(`[Outreach Service] Found ${messages.length} messages for lead ${leadId}`);
      return messages;
    } catch (indexError) {
      // Fallback without orderBy
      console.warn('[Outreach Service] Fallback: fetching without orderBy');
      const allDocs = await getDocs(messagesRef);
      const messages: OutreachMessage[] = [];
      
      allDocs.forEach((doc) => {
        const data = doc.data();
        if (data.leadId === leadId) {
          messages.push({
            id: doc.id,
            leadId: data.leadId,
            company: data.company,
            contactPerson: data.contactPerson,
            contactEmail: data.contactEmail,
            channel: data.channel,
            messageSubject: data.messageSubject,
            messageContent: data.messageContent,
            messagePreview: data.messagePreview,
            status: data.status,
            errorMessage: data.errorMessage,
            messageId: data.messageId,
            timestamp: data.timestamp?.toDate(),
            createdAt: data.createdAt?.toDate(),
          });
        }
      });
      
      // Sort by timestamp descending
      messages.sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
      return messages;
    }
  } catch (error) {
    console.error(`[Outreach Service] Error fetching messages for lead ${leadId}:`, error);
    return [];
  }
};

/**
 * Fetch outreach messages by email address
 */
export const fetchOutreachMessagesByEmail = async (email: string): Promise<OutreachMessage[]> => {
  try {
    console.log(`[Outreach Service] Fetching messages for email: ${email}`);
    
    const messagesRef = collection(db, 'outreach_history');
    
    try {
      const q = query(
        messagesRef,
        where('contactEmail', '==', email),
        orderBy('timestamp', 'desc')
      );
      const querySnapshot = await getDocs(q);
      const messages: OutreachMessage[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          leadId: data.leadId,
          company: data.company,
          contactPerson: data.contactPerson,
          contactEmail: data.contactEmail,
          channel: data.channel,
          messageSubject: data.messageSubject,
          messageContent: data.messageContent,
          messagePreview: data.messagePreview,
          status: data.status,
          errorMessage: data.errorMessage,
          messageId: data.messageId,
          timestamp: data.timestamp?.toDate(),
          createdAt: data.createdAt?.toDate(),
        });
      });
      
      console.log(`[Outreach Service] Found ${messages.length} messages for email ${email}`);
      return messages;
    } catch (indexError) {
      // Fallback without orderBy
      console.warn('[Outreach Service] Fallback: fetching without orderBy');
      const allDocs = await getDocs(messagesRef);
      const messages: OutreachMessage[] = [];
      
      allDocs.forEach((doc) => {
        const data = doc.data();
        if (data.contactEmail === email) {
          messages.push({
            id: doc.id,
            leadId: data.leadId,
            company: data.company,
            contactPerson: data.contactPerson,
            contactEmail: data.contactEmail,
            channel: data.channel,
            messageSubject: data.messageSubject,
            messageContent: data.messageContent,
            messagePreview: data.messagePreview,
            status: data.status,
            errorMessage: data.errorMessage,
            messageId: data.messageId,
            timestamp: data.timestamp?.toDate(),
            createdAt: data.createdAt?.toDate(),
          });
        }
      });
      
      // Sort by timestamp descending
      messages.sort((a, b) => (b.timestamp?.getTime() || 0) - (a.timestamp?.getTime() || 0));
      console.log(`[Outreach Service] Fallback found ${messages.length} messages`);
      return messages;
    }
  } catch (error) {
    console.error(`[Outreach Service] Error fetching messages for email ${email}:`, error);
    return [];
  }
};

/**
 * Fetch all conversation messages (sent + received) for a specific email
 * Combines outreach_history and inbound_emails collections
 */
export const fetchCompleteConversation = async (email: string): Promise<OutreachMessage[]> => {
  try {
    console.log(`[Outreach Service] Fetching complete conversation for email: ${email}`);
    
    const allMessages: OutreachMessage[] = [];
    
    // Fetch outbound messages
    try {
      const outreachRef = collection(db, 'outreach_history');
      const outreachQuery = query(outreachRef, where('contactEmail', '==', email));
      const outreachSnapshot = await getDocs(outreachQuery);
      
      outreachSnapshot.forEach((doc) => {
        const data = doc.data();
        allMessages.push({
          id: doc.id,
          leadId: data.leadId || '',
          company: data.company,
          contactPerson: data.contactPerson,
          contactEmail: data.contactEmail,
          channel: data.channel,
          messageSubject: data.messageSubject,
          messageContent: data.messageContent,
          messagePreview: data.messagePreview,
          status: data.status,
          errorMessage: data.errorMessage,
          messageId: data.messageId,
          timestamp: data.timestamp?.toDate?.() || new Date(),
          createdAt: data.createdAt?.toDate?.() || new Date(),
        });
      });
    } catch (error) {
      console.warn('[Outreach Service] Error fetching outbound messages:', error);
    }
    
    // Fetch inbound messages
    try {
      const inboundRef = collection(db, 'inbound_emails');
      const inboundQuery = query(inboundRef, where('contactEmail', '==', email));
      const inboundSnapshot = await getDocs(inboundQuery);
      
      inboundSnapshot.forEach((doc) => {
        const data = doc.data();
        allMessages.push({
          id: doc.id,
          leadId: data.leadId || '',
          company: data.company,
          contactPerson: data.contactPerson,
          contactEmail: data.contactEmail,
          channel: 'email' as PlatformType,
          messageSubject: `Re: ${data.subject}`,
          messageContent: data.content,
          messagePreview: data.content?.substring(0, 200) || '',
          status: data.status,
          errorMessage: data.errorMessage,
          messageId: data.messageId,
          timestamp: data.timestamp?.toDate?.() || new Date(),
          createdAt: data.createdAt?.toDate?.() || new Date(),
        });
      });
    } catch (error) {
      console.warn('[Outreach Service] Error fetching inbound messages:', error);
    }
    
    // Sort all messages by timestamp (ascending - oldest first)
    allMessages.sort((a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0));
    
    console.log(`[Outreach Service] Found ${allMessages.length} total conversation messages`);
    return allMessages;
  } catch (error) {
    console.error(`[Outreach Service] Error fetching complete conversation for email ${email}:`, error);
    return [];
  }
};

/**
 * Get platform icon
 */
export const getPlatformIcon = (platform: PlatformType) => {
  switch (platform) {
    case 'email':
      return '✉️';
    case 'whatsapp':
      return '💬';
    case 'telegram':
      return '📱';
    default:
      return '📧';
  }
};

/**
 * Format timestamp
 */
export const formatTime = (date: Date): string => {
  if (!date) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export const formatDate = (date: Date): string => {
  if (!date) return '';
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  } else if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  return date.toLocaleDateString();
};
