// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyC6fRe8-dblmTG7cXkSgl7-OvGDgbYY3HQ",
  authDomain: "jordan-761bf.firebaseapp.com",
  projectId: "jordan-761bf",
  storageBucket: "jordan-761bf.firebasestorage.app",
  messagingSenderId: "903231595732",
  appId: "1:903231595732:web:d1ccf3e88ae430e2a84741",
  measurementId: "G-J7BM8DQG0L"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export default app;
