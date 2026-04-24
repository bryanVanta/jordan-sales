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
- **AI/LLM**: OpenRouter (Free `openai/gpt-oss-120b:free` with reasoning)
- **Web Scraping**: Playwright
- **Search**: SerpApi
- **Email**: Nodemailer + Resend
- **WhatsApp**: Twilio
- **Real-time Database**: Firebase Firestore
- **Task Queue**: BullMQ + Redis

### Optional: Media storage (Cloudinary)
To render inbound WhatsApp images/voice notes in the chat UI, configure Cloudinary on the backend:
`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (optional `CLOUDINARY_FOLDER`).

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

6. **AI Training System**
   - Configure custom bot instructions and knowledge base
   - LLM follows personalized training automatically
   - Multi-turn conversations with advanced reasoning
   - Training data stored in Firestore

## API Documentation

### Backend Routes

**Companies**
- `GET /api/companies` - List all companies
- `POST /api/companies` - Create company
- `PUT /api/companies/:id` - Update company
- `DELETE /api/companies/:id` - Delete company

**Leads**
- `GET /api/leads` - List all leads
- `POST /api/leads` - Create lead
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead

**Messages**
- `GET /api/messages` - Fetch messages
- `POST /api/messages` - Send message

**Training**
- `GET /api/training` - Get latest training config
- `GET /api/training/:id` - Get specific training
- `POST /api/training` - Save training config
- `PUT /api/training/:id` - Update training config

**LLM / AI**
- `GET /api/llm/system-prompt` - Get current system prompt
- `POST /api/llm/prompt` - Generate LLM prompt with training
- `POST /api/llm/chat` - Send message to LLM with reasoning

## Environment Variables

### Frontend (`.env.local`)
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
```

### Backend (`.env.local`)
```
# Firebase
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

# OpenRouter (FREE AI/LLM)
OPENROUTER_API_KEY=

# Services (Optional)
SERPAPI_API_KEY=
NODEMAILER_USER=
NODEMAILER_PASS=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=

# Configuration
PORT=5000
NODE_ENV=development
REDIS_URL=redis://localhost:6379
```

## Project Status

- [x] Frontend scaffolding with Next.js + TypeScript
- [x] Backend server setup with Express.js
- [x] Project structure (Frontend/Backend separation)
- [x] Firebase Firestore integration and authentication
- [x] Database collections (Companies, Leads, Messages, Training)
- [x] Backend API routes (Companies, Leads, Messages, Training)
- [x] Frontend UI structure (Navbar, Dashboard, Chats, Training, Project)
- [x] Chat interface with customer list and multi-turn conversations
- [x] Training configuration system (Bot name, instructions, knowledge, product, location)
- [x] LLM Service with OpenRouter integration
- [x] Free AI model with advanced reasoning capabilities
- [x] Training-aware responses (LLM follows training instructions)
- [ ] Refine chat interface and reasoning display
- [ ] Email service integration
- [ ] Web scraping service (Playwright)
- [ ] Search service (SerpApi)
- [ ] WhatsApp service (Twilio)
- [ ] Task queue background jobs (BullMQ)
- [ ] Kanban board UI for lead management
- [ ] Sentiment scoring and lead segmentation

## License

MIT

## OpenRouter LLM Integration

The bot uses **free AI** via OpenRouter:

- **Model**: `openai/gpt-oss-120b:free` (completely free)
- **Features**: Advanced reasoning, multi-turn conversations
- **Setup**: See [OPENROUTER_SETUP.md](OPENROUTER_SETUP.md) for detailed configuration

### Quick Start
1. Get free OpenRouter API key from [openrouter.ai](https://openrouter.ai)
2. Add `OPENROUTER_API_KEY` to `backend/.env`
3. Configure training at the **Training** page
4. Start chatting! The AI will follow your training instructions

## Support

- **Setup Instructions**: See [.github/copilot-instructions.md](.github/copilot-instructions.md)
- **OpenRouter Setup**: See [OPENROUTER_SETUP.md](OPENROUTER_SETUP.md)
- **API Documentation**: See individual route handlers in `backend/server/routes/`
