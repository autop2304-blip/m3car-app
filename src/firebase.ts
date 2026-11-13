/**
 * Firebase Initialization for M3CAR
 * Connected directly to Cloud Firestore (gen-lang-client-0714886029)
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

export const firebaseConfig = {
  apiKey: "AIzaSyCY3Xvz-PXLWJcOb12YenQjBVb7N3GOOnw",
  authDomain: "://firebaseapp.com",
  projectId: "gen-lang-client-0714886029",
  storageBucket: "gen-lang-client-0714886029.firebasestorage.app",
  messagingSenderId: "34702845710",
  appId: "1:34702845710:web:71559b15f07edcf411595f",
  measurementId: "G-RZ011RRBR6",
};

export const app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);
