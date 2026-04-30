export const runtime = 'nodejs';

type FollowUpRequestBody = {
  leadId?: string | number;
  company?: string;
  message?: string;
  email?: string;
};

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function textToHtml(text: string) {
  const escaped = escapeHtml(text);
  return escaped.replace(/\r?\n/g, '<br/>');
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as FollowUpRequestBody;
    const leadId = body.leadId;
    const company = body.company || 'Company';
    const message = (body.message || '').trim();
    const email = (body.email || '').trim();

    if (!leadId || !message || !email) {
      return Response.json(
        { error: 'Missing required fields: leadId, message, email' },
        { status: 400 }
      );
    }

    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (backendUrl) {
      const proxied = await fetch(
        `${backendUrl.replace(/\/$/, '')}/api/follow-up/send`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      const proxiedJson = await proxied.json().catch(() => null);
      return Response.json(proxiedJson, { status: proxied.status });
    }

    const apiKey = (process.env.RESEND_API_KEY || '').trim();
    if (!apiKey) {
      return Response.json(
        {
          error: 'Missing RESEND_API_KEY',
          details:
            'Set RESEND_API_KEY (recommended), or set BACKEND_URL to proxy to the Express backend.',
        },
        { status: 500 }
      );
    }

    const from =
      process.env.OUTREACH_FROM_EMAIL ||
      process.env.RESEND_FROM_EMAIL ||
      process.env.DEFAULT_FROM_EMAIL ||
      'onboarding@resend.dev';

    const subject = `Follow-up: ${company}`;

    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject,
        text: message,
        html: `<div style="white-space: pre-wrap; font-family: Arial, sans-serif; line-height: 1.6;">${textToHtml(
          message
        )}</div>`,
        tags: leadId ? [{ name: 'leadId', value: String(leadId) }] : undefined,
      }),
    });

    const resendJson = await resendResp.json().catch(() => null);

    if (!resendResp.ok) {
      return Response.json(
        {
          error: 'Failed to send follow-up email',
          details:
            resendJson?.message ||
            resendJson?.error ||
            `Resend responded with ${resendResp.status}`,
        },
        { status: 502 }
      );
    }

    return Response.json({
      success: true,
      message: 'Follow-up email sent successfully',
      messageId: resendJson?.id || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: 'Failed to send follow-up email', details: message },
      { status: 500 }
    );
  }
}
