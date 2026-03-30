/**
 * Firebase Admin SDK Configuration
 * Initialize Firebase for backend services
 */

const admin = require('firebase-admin');
require('dotenv').config();

// Reconstruct the private key with proper headers.
// Strip any stray leading/trailing quotes that dotenv may leave when the
// .env value has an opening " but a missing closing " on the same line.
const rawPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || '')
  .replace(/^["']/, '')
  .replace(/["']$/, '');
const privateKey = rawPrivateKey.includes('-----BEGIN')
  ? rawPrivateKey.replace(/\\n/g, '\n')
  : `-----BEGIN PRIVATE KEY-----\n${rawPrivateKey.replace(/\\n/g, '\n')}\n-----END PRIVATE KEY-----`;

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

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = { admin, db };
