# Exposing WhatsApp inbound media to hooks (OpenClaw)

Your current `message:received` hook payload contains only the placeholder (`<media:image>`) plus sender metadata:

- no `MediaUrl(s)`
- no `MediaPath(s)`
- no bytes/base64

That means the hook **cannot** upload to Cloudinary (or any other storage), because it never receives the media.

This is **not fixable from the hook alone** — the WhatsApp channel plugin (Baileys) / OpenClaw gateway must expose either:

- a local file path (preferred): `MediaPath` / `MediaPaths`
- a downloadable URL: `MediaUrl` / `MediaUrls`
- or raw bytes/base64

Once any of those exist, `handler.ts` already has logic to:

- read local paths → base64 → Cloudinary → `media.url`, or
- download `http(s)` URLs → base64 → Cloudinary → `media.url`, or
- upload `data:...;base64,...` directly.

## Recommended approach

Expose **local temp file paths** via `MediaPath(s)` in the hook event.

Why:

- WhatsApp/Baileys does *not* naturally provide stable public URLs for inbound media.
- A local temp file path is cheap + deterministic in the gateway runtime.
- Your hook runs in the same gateway runtime, so it can `fs.readFile()` the media and upload to Cloudinary.

## Where to patch

OpenClaw’s official WhatsApp channel lives in the OpenClaw repo:

- `extensions/whatsapp/src/inbound/*`

There are already inbound media components there (for example `save-media.runtime.ts` / `media.ts`).

The fix is typically:

1) when inbound contains a media message (image/audio/video/document/sticker),
2) download the media bytes via Baileys,
3) write to a temp file,
4) attach the resulting path + type to the hook event context:

```ts
context.metadata.MediaPaths = ["/tmp/openclaw/media/inbound/<id>.jpg"]
context.metadata.MediaTypes = ["image/jpeg"]
// optionally:
context.metadata.MediaUrls = ["media://inbound/<id>.jpg"] // pseudo url
```

## Deployment options (gateway host)

Pick one:

### Option A: Patch OpenClaw from a git checkout (dev mode)

1. Clone OpenClaw on the gateway host (Ubuntu):
   - `git clone https://github.com/openclaw/openclaw.git`
2. Patch `extensions/whatsapp/` code.
3. Configure OpenClaw to load the WhatsApp extension from the local path (plugin load paths) or run OpenClaw directly from the checkout so it resolves `extensions/whatsapp` locally.
4. Restart the gateway.

### Option B: Patch an installed OpenClaw distribution

If your OpenClaw install has a `dist/extensions/whatsapp/` directory:

1. Copy the patched `extensions/whatsapp` into the runtime’s extensions directory.
2. Install extension deps (if needed).
3. Restart gateway.

Note: Some OpenClaw versions have packaging issues where WhatsApp is not included in npm builds; in that case you must copy it from the repo checkout (see upstream GitHub issues about `dist/extensions/whatsapp` missing).

## Smoke test

After patching + restarting gateway:

- Send an inbound WhatsApp image.
- Your hook logs should show (in the placeholder debug) keys like:
  - `MediaPath` / `mediaPath`, or
  - `MediaPaths` / `mediaPaths`, and
  - MIME type fields.

Once the hook sees a local path or URL, Cloudinary upload can succeed and the Salesbot UI can render the returned `media.url`.

## Temporary workaround (hook-side guessing)

`openclaw-hooks/whatsapp-forwarder/handler.ts` includes a best-effort fallback for gateways that only emit `<media:...>` placeholders:

- If the inbound body is `<media:image>` / `<media:audio>` but there are no bytes/url/path fields in the event,
- the hook scans common OpenClaw inbound media directories for a freshly-written file and uses that as `localPath`.
