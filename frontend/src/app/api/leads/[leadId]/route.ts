export const runtime = 'nodejs';

type Params = { leadId: string };

export async function GET(_req: Request, context: { params: Promise<Params> | Params }) {
  try {
    const params = 'then' in (context.params as any) ? await (context.params as Promise<Params>) : (context.params as Params);
    const leadId = String(params?.leadId || '').trim();
    if (!leadId) {
      return Response.json({ error: 'Missing leadId' }, { status: 400 });
    }

    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      return Response.json(
        {
          error: 'Missing BACKEND_URL',
          details: 'Lead lookup requires the Express backend. Set BACKEND_URL (recommended) or NEXT_PUBLIC_BACKEND_URL.',
        },
        { status: 500 }
      );
    }

    const proxied = await fetch(`${backendUrl.replace(/\/$/, '')}/api/leads/${encodeURIComponent(leadId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    const proxiedJson = await proxied.json().catch(() => null);
    return Response.json(proxiedJson, { status: proxied.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: 'Failed to load lead', details: message }, { status: 500 });
  }
}
