---
name: whatsapp-forwarder
description: "Forward inbound WhatsApp messages from OpenClaw Gateway to Salesbot backend webhook"
events:
  # OpenClaw event names vary across versions; include common variants so the hook still fires.
  - "message:received"
  - "message:preprocessed"
  - "message.received"
  - "message"
  - "whatsapp.message:received"
  - "whatsapp.message.received"
metadata:
  openclaw:
    emoji: "💬"
    # Newer OpenClaw versions read hook subscriptions from `metadata.openclaw.events`.
    # Keep the top-level `events` for backward compatibility.
    events:
      - "message:received"
      - "message:preprocessed"
      - "message.received"
      - "message"
      - "whatsapp.message:received"
      - "whatsapp.message.received"
---

# WhatsApp Forwarder

Forwards inbound WhatsApp messages received by the OpenClaw Gateway to the Salesbot backend endpoint:

- `POST /api/webhooks/inbound-whatsapp`

This forwarder supports normal text messages, images, and voice notes. If the gateway event includes media metadata (or a transcript), the hook forwards it as `media` / `transcript` alongside the normal `body` field.

## Required env

- `SALESBOT_BACKEND_URL` (recommended; must be reachable from the machine/container running OpenClaw). If unset, the hook falls back to `http://192.168.100.92:5000`.

## Optional env

- `SALESBOT_WEBHOOK_TOKEN` (shared secret; must match `INBOUND_WHATSAPP_WEBHOOK_TOKEN` on the backend if you enable auth)
- `WHATSAPP_FORWARDER_DEBUG=1` (log extra diagnostics about media placeholders + event keys)

### Optional: Cloudinary (Option A, for rendering media in the Salesbot UI)
If you want the Salesbot UI to display actual WhatsApp images/voice notes, the gateway hook must upload the media bytes to Cloudinary and forward the resulting URL to the backend.

Note: Cloudinary upload requires the hook runtime to provide `fetch` + `FormData` (for example Node 18+). The webhook forward to the backend works even on older runtimes.
Also note: Cloudinary upload can only work if the inbound event payload includes the media bytes (base64) or some direct download URL. If OpenClaw only emits a placeholder like `<media:image>` with no bytes/URL, the UI will show “no URL from gateway”.

This hook also supports a local `.env` file placed next to `handler.ts` (inside the `whatsapp-forwarder` hook folder). On startup it will load any missing `CLOUDINARY_*` vars from that file (it will not override existing environment variables). This helps when the OpenClaw gateway container wasn’t started with Cloudinary env vars.

Set either:
- Unsigned upload (recommended): `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET` (optionally `CLOUDINARY_FOLDER`)
- Signed upload: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (optionally `CLOUDINARY_FOLDER`)
