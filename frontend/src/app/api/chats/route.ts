export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const backendUrl = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      return Response.json(
        {
          error: 'Missing BACKEND_URL',
          details: 'Chat loading requires the Express backend when browser Firestore reads are blocked.',
        },
        { status: 500 }
      );
    }

    const proxied = await fetch(`${backendUrl.replace(/\/$/, '')}/api/outreach/chats?${url.searchParams.toString()}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });

    const proxiedJson = await proxied.json().catch(() => null);
    return Response.json(proxiedJson, { status: proxied.status });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: 'Failed to load chats', details: message }, { status: 500 });
  }
}
