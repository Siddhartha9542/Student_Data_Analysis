// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBWy1RxNC273Mu3cl3Ygc32WgExAWEqVLI", // Your new key
  authDomain: "student-data-analysis-85831.firebaseapp.com",
  projectId: "student-data-analysis-85831",
  storageBucket: "student-data-analysis-85831.firebasestorage.app",
  messagingSenderId: "739540856409",
  appId: "1:739540856409:web:155e5d3efb17211aff8b48",
  measurementId: "G-Y0VK71KDB1"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export default app;
