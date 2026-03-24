# Salesbot - Automated Sales Prospecting Bot

Complete full-stack application for automated sales prospecting with AI-powered email campaigns, web scraping, and multi-channel communications.

## Project Structure

```
jordan-salesbot/
├── frontend/                    # Next.js React frontend application
│   ├── src/
│   │   ├── app/                # Next.js App Router
│   │   ├── components/         # React components
│   │   ├── services/           # Frontend API services
│   │   ├── lib/                # Utilities and configs
│   │   └── types/              # TypeScript types
│   ├── package.json            # Frontend dependencies
│   ├── tsconfig.json           # TypeScript config
│   ├── next.config.js          # Next.js config
│   └── tailwind.config.ts      # Tailwind CSS config
│
├── backend/                     # Node.js/Express backend
│   ├── server/
│   │   ├── index.js            # Express server entry point
│   │   ├── routes/             # API routes (to be created)
│   │   ├── services/           # Business logic services
│   │   ├── middleware/         # Express middleware
│   │   └── jobs/               # BullMQ job processors
│   ├── package.json            # Backend dependencies
│   └── .env.example            # Environment template
│
├── .github/                     # GitHub configuration
│   └── copilot-instructions.md # Copilot instructions
│
├── .gitignore
└── README.md
```

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ with React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: React Hooks / Context API

### Backend
- **Runtime**: Node.js
- **Framework**: Express
- **Database**: Firebase (Firestore)
- **Task Queue**: BullMQ + Redis
- **Scheduling**: node-cron

### Services & Integrations
- **Web Scraping**: Playwright
- **Search**: SerpApi
- **AI**: OpenClaw
- **Email**: Nodemailer + Resend
- **WhatsApp**: Twilio
- **Real-time Database**: Firebase

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- Redis (for task queue)
- Firebase project with credentials

### Installation

1. **Clone and install dependencies**

```bash
# Frontend
cd frontend
npm install

# Backend (in separate terminal)
cd backend
npm install
```

2. **Configure environment variables**

```bash
# Frontend
cd frontend
cp .env.example .env.local
# Fill in your API keys

# Backend
cd backend
cp .env.example .env.local
# Fill in your API keys
```

### Development

**Terminal 1 - Frontend (Next.js on port 3000)**
```bash
cd frontend
npm run dev
```

**Terminal 2 - Backend (Express on port 5000)**
```bash
cd backend
npm run dev
```

### Building

**Frontend**
```bash
cd frontend
npm run build
npm run start
```

**Backend**
```bash
cd backend
npm run build
npm start
```

## Available Scripts

### Frontend (`frontend/`)
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - TypeScript type checking

### Backend (`backend/`)
- `npm run dev` - Start development server
- `npm start` - Start production server

## Key Features

1. **Web Scraping**
   - Google search for potential companies
   - Website scraping to find contact information
   - Captcha detection and fallback logic

2. **Email Campaigns**
   - Automated email sending with inbox rotation
   - AI-generated personalized email content
   - Email validation before sending

3. **Communications**
   - Email (Nodemailer + Resend)
   - WhatsApp (Twilio)
   - Message fetching and display on admin dashboard

4. **Lead Management**
   - Kanban board for status tracking (hot/cold/warm/dead)
   - Sentiment scoring for lead prioritization
   - Lead segmentation and organization

5. **Task Automation**
   - Background job processing with BullMQ
   - Scheduled tasks with node-cron
   - Anti-spam mitigation (3-email rotation, random delays)

## API Documentation

### Backend Routes (coming soon)
- `GET /api/status` - Service status
- `POST /api/companies/search` - Search for companies
- `POST /api/leads` - Create/manage leads
- `POST /api/campaigns/send` - Send email campaigns
- `GET /api/messages` - Fetch messages
- `POST /api/messages/reply` - Reply to messages

## Environment Variables

### Frontend (`.env.local`)
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
SERPAPI_API_KEY=
TWILIO_ACCOUNT_SID=
```

### Backend (`.env.local`)
```
REDIS_URL=redis://localhost:6379
FIREBASE_PROJECT_ID=
NODEMAILER_USER=
NODEMAILER_PASS=
TWILIO_ACCOUNT_SID=
```

## Project Status

- [x] Frontend scaffolding with Next.js
- [x] Backend server setup
- [x] Project structure organization
- [ ] Firebase Firestore integration
- [ ] Search service (SerpApi)
- [ ] Scraping service (Playwright)
- [ ] Email service
- [ ] WhatsApp service
- [ ] AI service (OpenClaw)
- [ ] Task queue setup
- [ ] Admin dashboard UI
- [ ] Kanban board UI

## License

MIT

## Support

For documentation and detailed instructions, see `.github/copilot-instructions.md`
