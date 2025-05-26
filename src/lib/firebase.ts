import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore, Timestamp } from "firebase/firestore";
// Removed Functions import

// Define placeholder values to check against
const PLACEHOLDER_API_KEY = "YOUR_API_KEY";
const PLACEHOLDER_AUTH_DOMAIN = "YOUR_AUTH_DOMAIN";
const PLACEHOLDER_PROJECT_ID = "YOUR_PROJECT_ID";
const PLACEHOLDER_STORAGE_BUCKET = "YOUR_STORAGE_BUCKET";
const PLACEHOLDER_MESSAGING_SENDER_ID = "YOUR_MESSAGING_SENDER_ID";
const PLACEHOLDER_APP_ID = "YOUR_APP_ID";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || PLACEHOLDER_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || PLACEHOLDER_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || PLACEHOLDER_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || PLACEHOLDER_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || PLACEHOLDER_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || PLACEHOLDER_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
};

if (
  firebaseConfig.apiKey === PLACEHOLDER_API_KEY ||
  firebaseConfig.authDomain === PLACEHOLDER_AUTH_DOMAIN ||
  firebaseConfig.projectId === PLACEHOLDER_PROJECT_ID ||
  !firebaseConfig.apiKey ||
  !firebaseConfig.authDomain ||
  !firebaseConfig.projectId
) {
  const exampleEnvContent = 
    "NEXT_PUBLIC_FIREBASE_API_KEY=your_actual_api_key\\n" +
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_actual_auth_domain\\n" +
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_actual_project_id\\n" +
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_actual_storage_bucket\\n" +
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_actual_messaging_sender_id\\n" +
    "NEXT_PUBLIC_FIREBASE_APP_ID=your_actual_app_id\\n" +
    "(Optional) NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_actual_measurement_id";

  throw new Error(
    "Firebase configuration is incomplete or uses placeholder values. " +
    "Please create or update the .env file in the root of your project " +
    "with your actual Firebase project credentials. For example:\\n" +
    exampleEnvContent + "\\n" +
    "You can find these credentials in your Firebase project settings."
  );
}

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
// Removed functions instance

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

auth = getAuth(app);
db = getFirestore(app);
// functions = getFunctions(app); // Removed Functions initialization

export { app, auth, db, Timestamp }; // Removed functions from export
