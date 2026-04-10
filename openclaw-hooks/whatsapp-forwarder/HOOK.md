---
name: whatsapp-forwarder
description: "Forward inbound WhatsApp messages from OpenClaw Gateway to Salesbot backend webhook"
events:
  # OpenClaw event names vary across versions; include common variants so the hook still fires.
  - "message:received"
  - "message.received"
  - "message"
  - "whatsapp.message:received"
  - "whatsapp.message.received"
metadata:
  openclaw:
    emoji: "💬"
    requires:
      env:
        - SALESBOT_BACKEND_URL
---

# WhatsApp Forwarder

Forwards inbound WhatsApp messages received by the OpenClaw Gateway to the Salesbot backend endpoint:

- `POST /api/webhooks/inbound-whatsapp`

## Required env

- `SALESBOT_BACKEND_URL` (example: `http://localhost:5000` or your deployed backend base URL)

## Optional env

- `SALESBOT_WEBHOOK_TOKEN` (shared secret; must match `INBOUND_WHATSAPP_WEBHOOK_TOKEN` on the backend if you enable auth)
