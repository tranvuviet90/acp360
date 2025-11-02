// src/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAGvQfZqBI4QF6rIFLWVYMghkIuKlK6X6A",
  authDomain: "acp360.firebaseapp.com",           // <- đúng đuôi .firebaseapp.com
  projectId: "acp360",
  storageBucket: "acp360.firebasestorage.app",    // <- đúng tên bucket như Console
  messagingSenderId: "707311671101",
  appId: "1:707311671101:web:b5cbf0a09bcd0e51dd1754",
  measurementId: "G-HKEN8XF94L"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
// Chỉ định tường minh đúng bucket gs://
export const storage = getStorage(app, "gs://acp360.firebasestorage.app");
