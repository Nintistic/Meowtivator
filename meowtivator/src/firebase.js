// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported as isAnalyticsSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "[REDACTED_API_KEY]",
  authDomain: "[REDACTED_PROJECT_ID].firebaseapp.com",
  projectId: "[REDACTED_PROJECT_ID]",
  storageBucket: "[REDACTED_PROJECT_ID].firebasestorage.app",
  messagingSenderId: "[REDACTED]",
  appId: "1:[REDACTED]:web:0e1bc162e912eff04ee715",
  measurementId: "[REDACTED_MEASUREMENT_ID]"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

let analytics = null;
if (typeof window !== "undefined") {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      analytics = null;
    });
}

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Export project ID for use as appId in Firestore paths
export const appId = firebaseConfig.projectId;

export { analytics };
export default app;
