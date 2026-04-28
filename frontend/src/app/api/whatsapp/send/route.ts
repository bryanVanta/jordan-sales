export const runtime = 'nodejs';

type WhatsAppSendBody = {
  leadId?: string;
  company?: string;
  message?: string;
  whatsapp?: string;
  media?: unknown;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as WhatsAppSendBody;

    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      return Response.json(
        {
          error: 'Missing BACKEND_URL',
          details:
            'WhatsApp sending requires the Express backend. Set BACKEND_URL (recommended) or NEXT_PUBLIC_BACKEND_URL.',
        },
        { status: 500 }
      );
    }

    const proxied = await fetch(`${backendUrl.replace(/\/$/, '')}/api/whatsapp/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const proxiedJson = await proxied.json().catch(() => null);
    return Response.json(proxiedJson, { status: proxied.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: 'Failed to send WhatsApp message', details: message }, { status: 500 });
  }
}

