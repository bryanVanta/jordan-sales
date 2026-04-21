type OpenClawHookEvent = {
  type?: string;
  action?: string;
  timestamp?: string | number;
  sessionKey?: string;
  context?: {
    from?: string;
    to?: string;
    content?: string;
    channelId?: string;
    metadata?: Record<string, any>;
  };
  messages?: any[];
};

declare const process: { env: Record<string, string | undefined> };

const isWhatsAppChannel = (valueRaw: unknown) => {
  const value = String(valueRaw || '').toLowerCase();
  return value === 'whatsapp' || value.includes('whatsapp');
};

const stripTrailingSlash = (value: string) => (value.endsWith('/') ? value.slice(0, -1) : value);

const normalizePhone = (valueRaw: unknown) => {
  const value = String(valueRaw || '').trim();
  if (!value) return '';

  const withoutPrefix = value.startsWith('whatsapp:') ? value.slice('whatsapp:'.length) : value;
  const withoutJid = withoutPrefix.includes('@') ? withoutPrefix.split('@')[0] : withoutPrefix;
  const digits = withoutJid.replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
};

const getTimestampIso = (value: unknown) => {
  if (typeof value === 'string') {
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
  }
  if (typeof value === 'number') {
    const asDate = new Date(value);
    if (!Number.isNaN(asDate.getTime())) return asDate.toISOString();
  }
  return new Date().toISOString();
};

const coerceBodyFromMessages = (messages: any[] | undefined) => {
  if (!Array.isArray(messages) || messages.length === 0) return '';

  const parts = messages
    .map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return '';
      if (typeof item.content === 'string') return item.content;
      if (typeof item.text === 'string') return item.text;
      if (typeof item.body === 'string') return item.body;
      return '';
    })
    .filter(Boolean);

  return parts.join('\n').trim();
};

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
};

const pickMessageField = (messages: any[] | undefined, fieldNames: string[]) => {
  if (!Array.isArray(messages)) return '';

  for (const item of messages) {
    if (!item || typeof item !== 'object') continue;
    for (const fieldName of fieldNames) {
      const value = (item as any)[fieldName];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }

  return '';
};

const handler = async (event: OpenClawHookEvent) => {
  try {
    console.log('[whatsapp-forwarder] event entered', {
      type: (event as any).type || null,
      action: (event as any).action || null,
      channelId: (event as any).context?.channelId || null,
      sessionKey: (event as any).sessionKey || null,
    });

    const debug = process.env.WHATSAPP_FORWARDER_DEBUG === '1';
    const eventAction = String((event as any).action || '').trim().toLowerCase();
    const eventType = String((event as any).type || '').trim().toLowerCase();

    const channelId =
      event.context?.channelId ||
      (event as any).channelId ||
      (event as any).channel ||
      (event as any).context?.channel ||
      (event as any).metadata?.channel ||
      null;

    const isWhatsApp =
      isWhatsAppChannel(channelId) ||
      isWhatsAppChannel(event.sessionKey) ||
      isWhatsAppChannel((event as any).sessionKey) ||
      isWhatsAppChannel((event as any).context?.metadata?.channelId) ||
      isWhatsAppChannel((event as any).context?.metadata?.channel) ||
      false;

    if (eventType === 'message' && eventAction && eventAction !== 'received') {
      if (debug) {
        console.log('[whatsapp-forwarder] skip (non-received action)', {
          type: eventType,
          action: eventAction,
          sessionKey: (event as any).sessionKey || null,
        });
      }
      return;
    }

    if (!isWhatsApp) {
      if (debug) {
        console.log('[whatsapp-forwarder] ignore (not whatsapp)', {
          type: eventType || null,
          action: eventAction || null,
          sessionKey: (event as any).sessionKey || null,
          channelId,
          contextKeys: Object.keys((event as any).context || {}),
          topKeys: Object.keys(event as any),
        });
      }
      return;
    }

    const backendUrl = String(process.env.SALESBOT_BACKEND_URL || '').trim();
    const token = process.env.SALESBOT_WEBHOOK_TOKEN;
    if (!backendUrl) {
      console.log('[whatsapp-forwarder] skip (missing backend url)');
      return;
    }

    const fromRaw = pickFirstString(
      event.context?.from ||
      (event as any).from ||
      (event as any).context?.sender ||
      (event as any).message?.from ||
      (event as any).context?.metadata?.from ||
      (event as any).context?.metadata?.sender ||
      pickMessageField(event.messages, ['from', 'sender', 'author', 'jid'])
    );
    const toRaw = pickFirstString(
      event.context?.to ||
      (event as any).to ||
      (event as any).context?.recipient ||
      (event as any).message?.to ||
      (event as any).context?.metadata?.to ||
      (event as any).context?.metadata?.recipient ||
      pickMessageField(event.messages, ['to', 'recipient'])
    );
    const bodyRaw = pickFirstString(
      event.context?.content ||
      (event as any).content ||
      (event as any).body ||
      (event as any).message?.content ||
      (event as any).message?.body ||
      (event as any).context?.content ||
      (event as any).context?.metadata?.content ||
      (event as any).context?.metadata?.body ||
      pickMessageField(event.messages, ['content', 'text', 'body', 'caption'])
    );

    const from = normalizePhone(fromRaw);
    const to = normalizePhone(toRaw);
    const body = String(bodyRaw || '').trim() || coerceBodyFromMessages(event.messages);
    const messageId =
      event.context?.metadata?.messageId ||
      event.context?.metadata?.id ||
      event.context?.metadata?.msgId ||
      (event as any).context?.metadata?.messageId ||
      (event as any).context?.metadata?.id ||
      (event as any).messageId ||
      (event as any).id ||
      null;

    console.log('[whatsapp-forwarder] extracted', {
      channelId,
      sessionKey: event.sessionKey || null,
      hasBackendUrl: Boolean(backendUrl),
      fromRaw: fromRaw || null,
      toRaw: toRaw || null,
      bodyPreview: body ? body.slice(0, 80) : null,
      messageCount: Array.isArray(event.messages) ? event.messages.length : 0,
    });

    if (!from || !body) {
      console.log('[whatsapp-forwarder] skip (missing from/body)', {
        channelId,
        sessionKey: event.sessionKey || null,
        hasFrom: Boolean(from),
        hasBody: Boolean(body),
      });
      return;
    }

    if (debug) {
      console.log('[whatsapp-forwarder] match', {
        channelId,
        sessionKey: event.sessionKey || null,
        from,
        to: to || null,
        bodyPreview: body.slice(0, 80),
      });
    }

    const endpoint = `${stripTrailingSlash(backendUrl)}/api/webhooks/inbound-whatsapp`;

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to,
        body,
        messageId,
        timestamp: getTimestampIso(event.timestamp),
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.log('[whatsapp-forwarder] forward failed:', resp.status, text.slice(0, 300));
      return;
    }

    console.log('[whatsapp-forwarder] forwarded:', { from, to: to || undefined, messageId: messageId || undefined });
  } catch (error) {
    // Hooks should fail closed (no throw) to avoid blocking the gateway.
    console.log('[whatsapp-forwarder] error:', error instanceof Error ? error.message : String(error));
  }
};

export default handler;
