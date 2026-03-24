// Environment variables configuration
export const config = {
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  },
  apis: {
    serpApi: process.env.SERPAPI_API_KEY,
    openClaw: process.env.OPENCLAW_API_KEY,
  },
  communications: {
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    },
    email: {
      nodemailer: {
        user: process.env.NODEMAILER_USER,
        pass: process.env.NODEMAILER_PASS,
      },
      resend: {
        apiKey: process.env.RESEND_API_KEY,
      },
    },
  },
  database: {
    redis: process.env.REDIS_URL,
  },
};
