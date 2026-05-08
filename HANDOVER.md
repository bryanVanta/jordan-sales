# Project Handover: Salesbot - Automated Sales Prospecting Bot

## Overview
Salesbot is a full-stack, AI-powered sales prospecting platform. It automates lead generation, outreach, and communication via email and WhatsApp, with advanced web scraping, campaign management, and lead tracking. The project is organized as a monorepo with separate frontend (Next.js/React) and backend (Node.js/Express) applications.

---

## 1. Project Structure

```
jordan-salesbot/
├── frontend/   # Next.js 14, React 18, TypeScript, Tailwind CSS
├── backend/    # Node.js, Express, BullMQ, Playwright, Firebase Admin
├── .github/    # Copilot and workflow instructions
├── README.md   # Main documentation
└── ...
```

- **frontend/**: User/admin dashboard, Kanban board, chat UI, campaign manager, etc.
- **backend/**: API, business logic, scraping, email/WhatsApp, task queue, integrations.

---

## 2. Key Technologies

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS, Firebase SDK
- **Backend**: Node.js, Express, BullMQ (Redis), Playwright, Nodemailer, Resend, Twilio, Firebase Admin SDK
- **Integrations**: SerpApi (Google search), OpenClaw (AI), Cloudinary (media), Firestore (DB)

---

## 3. Setup & Development

### Prerequisites
- Node.js 18+
- npm or yarn
- Redis server
- Firebase project (credentials for both frontend and backend)

### Installation
1. **Clone repo & install dependencies**
   - `cd frontend && npm install`
   - `cd backend && npm install`
2. **Configure environment variables**
   - Copy `.env.example` to `.env.local` in both frontend and backend
   - Fill in all required API keys and credentials
3. **Start development servers**
   - Frontend: `cd frontend && npm run dev` (http://localhost:3000)
   - Backend: `cd backend && npm run dev` (http://localhost:5000)

### Build for Production
- Frontend: `npm run build && npm run start`
- Backend: `npm run build && npm start`

---

## 4. Core Features
- **Web Scraping**: Google search (SerpApi), Playwright scraping, captcha handling
- **Email Campaigns**: Inbox rotation, AI-personalized content, validation, anti-spam
- **Lead Management**: Kanban board, sentiment scoring, segmentation
- **Communications**: Email (Nodemailer/Resend), WhatsApp (Twilio), unified inbox
- **Task Automation**: BullMQ jobs, node-cron scheduling
- **AI/LLM**: OpenClaw/Router, custom training, multi-turn chat

---

## 5. Environment Variables
- See `.env.example` in both frontend and backend for required keys (Firebase, Redis, SerpApi, Twilio, Nodemailer, etc.)
- **Never commit secrets!**

---

## 6. Important Files & Folders
- `frontend/src/` — App, components, services, types
- `backend/server/routes/` — API endpoints
- `backend/server/services/` — Business logic, integrations
- `backend/server/jobs/` — BullMQ processors
- `.github/copilot-instructions.md` — Setup, architecture, and workflow details

---

## 7. Next Steps for New Developers
- Review `.github/copilot-instructions.md` for architecture and workflow
- Check `README.md` for scripts, features, and API docs
- Set up Firebase and Redis locally (see instructions)
- Implement or extend services as needed (see TODOs in code and README)
- Use the Kanban board and admin dashboard for lead management
- For new features, follow the existing folder structure and code style

---

## 8. Troubleshooting & Tips
- **Port conflicts**: Change ports in `next.config.js` (frontend) or set `PORT` env (backend)
- **Firebase issues**: Double-check credentials and Firestore rules
- **Redis issues**: Ensure Redis is running and `REDIS_URL` is correct
- **Email/WhatsApp**: Use test credentials for dev; production keys for live
- **Performance**: Use inbox rotation, random delays, and anti-spam logic for campaigns

---

## 9. Documentation & Support
- Main docs: `README.md`
- Setup/workflow: `.github/copilot-instructions.md`
- API: See route handlers in `backend/server/routes/`
- For LLM/AI: See `OPENCLAW_SSH_SETUP.md` and related files

---

## 10. Contact
For questions, check the documentation first. If you need further help, contact the previous maintainer or project owner.

---

**Good luck!**
