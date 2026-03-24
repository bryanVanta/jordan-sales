<!-- Salesbot Workspace Setup Instructions -->

## Project: Salesbot - Automated Sales Prospecting Bot

### ✅ Setup Status Checklist

- [x] Create copilot-instructions.md file
- [x] Scaffold Next.js project with TypeScript, Tailwind CSS, ESLint, App Router
- [x] Organize project into Frontend and Backend folders
- [x] Install required dependencies
- [x] Create development startup tasks
- [x] Project builds successfully without errors
- [x] Environment configuration files created

### Project Architecture

```
jordan-salesbot/
├── frontend/                    # Next.js React frontend (port 3000)
│   ├── src/
│   │   ├── app/                # Next.js App Router
│   │   ├── components/         # React components
│   │   ├── services/           # API services
│   │   ├── lib/                # Utilities & configs
│   │   └── types/              # TypeScript types
│   ├── package.json            # Frontend dependencies
│   ├── next.config.js
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── .env.local
│
├── backend/                     # Express.js backend (port 5000)
│   ├── server/
│   │   ├── index.js            # Express server entry
│   │   ├── routes/             # API endpoints
│   │   ├── services/           # Business logic
│   │   ├── middleware/         # Express middleware
│   │   └── jobs/               # BullMQ processors
│   ├── package.json
│   └── .env.local
│
├── .github/
│   └── copilot-instructions.md
├── README.md                    # Monorepo documentation
└── .gitignore
```

### Tech Stack

**Frontend**
- Next.js 14 with React 18
- TypeScript
- Tailwind CSS
- Firebase SDK

**Backend**
- Node.js + Express
- Playwright (scraping)
- Nodemailer + Resend (email)
- Twilio (WhatsApp)
- BullMQ + Redis (task queue)
- Firebase Admin SDK

**Services**
- SerpApi (Google search)
- OpenClaw (AI)
- Firebase Firestore (database)

### Development Workflow

#### Starting Development

**Terminal 1: Frontend**
```bash
cd frontend
npm run dev
# Runs on http://localhost:3000
```

**Terminal 2: Backend**
```bash
cd backend
npm run dev
# Runs on http://localhost:5000
```

#### Build for Production

```bash
# Frontend
cd frontend
npm run build && npm run start

# Backend
cd backend
npm run build && npm start
```

### Available Scripts

**Frontend** (`frontend/`)
- `npm run dev` - Start development server
- `npm run build` - Production build
- `npm run start` - Start production server
- `npm run lint` - ESLint check
- `npm run type-check` - TypeScript validation

**Backend** (`backend/`)
- `npm run dev` - Start development server
- `npm start` - Start production server

### Environment Variables

**Frontend** (`frontend/.env.local`)
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
SERPAPI_API_KEY=
TWILIO_ACCOUNT_SID=
```

**Backend** (`backend/.env.local`)
```
REDIS_URL=redis://localhost:6379
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
NODEMAILER_USER=
NODEMAILER_PASS=
TWILIO_ACCOUNT_SID=
```

### Key Features to Implement

1. Web Scraping
   - Google search for companies
   - Website contact info extraction
   - Captcha detection & fallback

2. Email Campaigns
   - Inbox rotation (3 emails)
   - AI-generated personalized content
   - Email validation (ZeroBounce/deeptry-mail-validator)

3. Lead Management
   - Kanban board (hot/cold/warm/dead)
   - Sentiment scoring
   - Lead segmentation

4. Communications
   - Email (Nodemailer + Resend)
   - WhatsApp (Twilio)
   - Message inbox & replies

5. Task Automation
   - BullMQ background jobs
   - node-cron scheduling
   - Anti-spam patterns

### Next Steps

1. **Configure Firebase**
   - Create Firebase project
   - Add credentials to both `.env.local` files

2. **Set up Redis**
   - Local: `redis-server`
   - Cloud: Update `REDIS_URL`

3. **Implement Core Services**
   - [ ] Search Service (SerpApi)
   - [ ] Scraping Service (Playwright)
   - [ ] Email Service (Nodemailer/Resend)
   - [ ] WhatsApp Service (Twilio)
   - [ ] AI Service (OpenClaw)
   - [ ] Task Queue (BullMQ)

4. **Build UI Components**
   - [ ] Admin Dashboard
   - [ ] Kanban Board
   - [ ] Company Search
   - [ ] Message Inbox
   - [ ] Campaign Manager

5. **Backend Endpoints**
   - [ ] Companies API
   - [ ] Leads API
   - [ ] Campaigns API
   - [ ] Messages API
   - [ ] Analytics API

### Troubleshooting

**Port conflicts:**
- Frontend: Change in `next.config.js` or use `-p` flag
- Backend: Set `PORT` environment variable

**Firebase issues:**
- Verify API credentials in `.env.local`
- Check Firestore rules for public read/write access (dev only)

**Redis connection:**
- Ensure Redis is running: `redis-cli ping`
- Check `REDIS_URL` format: `redis://localhost:6379`

### Performance Considerations

**Email Sending:**
- Use inbox rotation (3 senders)
- Random delays between sends
- Rate limiting per IP/domain

**Web Scraping:**
- Implement captcha detection
- Backoff strategy for IP blocks
- User-agent rotation

**Data Validation:**
- Email validation before sending
- LinkedIn honeypot detection
- Domain reputation checks

