// Firebase configuration
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: "AIzaSyDWp0qOWaL-gLWYG-4zvQ-wpSQOJpvGgVg",
  authDomain: "incidencias-85d73.firebaseapp.com",
  databaseURL: "https://incidencias-85d73-default-rtdb.firebaseio.com",
  projectId: "incidencias-85d73",
  storageBucket: "incidencias-85d73.firebasestorage.app",
  messagingSenderId: "102993226446",
  appId: "1:102993226446:web:9f02b8507d8c0b78f57e9f",
  measurementId: "G-NYME41GZ1B"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const functions = getFunctions(app);
export default app;
