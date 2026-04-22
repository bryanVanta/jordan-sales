// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyC-a8v6gE2vD_WKGEu_HSSZ49o4DELHs64",
  authDomain: "jordan-salesbot.firebaseapp.com",
  projectId: "jordan-salesbot",
  storageBucket: "jordan-salesbot.firebasestorage.app",
  messagingSenderId: "17120420259",
  appId: "1:17120420259:web:46da3a8bd76bd08ebc7a16",
  measurementId: "G-GGQSEP224Y",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
