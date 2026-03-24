# Salesbot Frontend

Next.js React application for the Salesbot - Automated Sales Prospecting Bot admin dashboard and user interface.

## Features

- Admin dashboard for lead management
- Kanban board for customer segmentation (hot/cold/warm/dead)
- Email campaign management
- Message inbox for emails and WhatsApp
- Lead search and filtering
- Sentiment score visualization
- Campaign analytics

## Tech Stack

- **Framework**: Next.js 14+ with React 18
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: Firebase (Firestore)
- **API Client**: Axios

## Getting Started

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### Building

```bash
npm run build
npm run start
```

## Project Structure

```
src/
├── app/                 # Next.js App Router
│   ├── layout.tsx       # Root layout
│   ├── page.tsx         # Home page
│   ├── globals.css      # Global styles
│   └── api/             # API routes
├── components/          # Reusable React components
├── lib/
│   ├── firebase.ts      # Firebase configuration
│   └── config.ts        # App configuration
├── services/            # API services and business logic
│   ├── scraping.ts
│   ├── search.ts
│   ├── email.ts
│   ├── whatsapp.ts
│   ├── ai.ts
│   └── taskQueue.ts
└── types/
    └── index.ts         # TypeScript type definitions
```

## Environment Variables

Create `.env.local` from `.env.example` and fill in:

```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
SERPAPI_API_KEY=
TWILIO_ACCOUNT_SID=
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - TypeScript type checking

## Next Steps

1. Set up Firebase project and credentials
2. Configure environment variables in `.env.local`
3. Implement admin dashboard components
4. Create Kanban board UI
5. Build message management interface
6. Integrate with backend API

## License

MIT

