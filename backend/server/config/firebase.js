/**
 * Firebase Admin SDK Configuration
 * Initialize Firebase for backend services
 */

const admin = require('firebase-admin');
require('dotenv').config();

// Reconstruct the private key with proper headers
let rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY || '';

// Remove surrounding quotes if present
if ((rawPrivateKey.startsWith('"') && rawPrivateKey.endsWith('"')) ||
    (rawPrivateKey.startsWith("'") && rawPrivateKey.endsWith("'"))) {
  rawPrivateKey = rawPrivateKey.slice(1, -1);
}

// Replace escaped newlines with actual newlines
const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: "",
  private_key: privateKey,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: "",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
};


// Debug logs for environment variables
console.log('[FIREBASE] Client Email:', process.env.FIREBASE_CLIENT_EMAIL);
console.log('[FIREBASE] Private Key Length:', privateKey.length);

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = { admin, db };
