
import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore, Timestamp } from "firebase/firestore";
// Remove Functions import if not used, or keep if you plan to re-add functions later
// import { getFunctions, type Functions } from "firebase/functions";

// Define placeholder values to check against.
// These should match the initial placeholder text in your .env to trigger the error correctly.
const PLACEHOLDER_API_KEY = "YOUR_NEW_API_KEY_HERE";
const PLACEHOLDER_AUTH_DOMAIN = "YOUR_NEW_AUTH_DOMAIN_HERE";
const PLACEHOLDER_PROJECT_ID = "YOUR_NEW_PROJECT_ID_HERE";
// Add other placeholders if you want to make them mandatory for the check
// const PLACEHOLDER_STORAGE_BUCKET = "YOUR_NEW_STORAGE_BUCKET_HERE";
// const PLACEHOLDER_MESSAGING_SENDER_ID = "YOUR_NEW_MESSAGING_SENDER_ID_HERE";
// const PLACEHOLDER_APP_ID = "YOUR_NEW_APP_ID_HERE";


const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined, // Keep this optional
};

// Check for placeholder or missing essential values
if (
  !firebaseConfig.apiKey || firebaseConfig.apiKey === PLACEHOLDER_API_KEY ||
  !firebaseConfig.authDomain || firebaseConfig.authDomain === PLACEHOLDER_AUTH_DOMAIN ||
  !firebaseConfig.projectId || firebaseConfig.projectId === PLACEHOLDER_PROJECT_ID
) {
  const exampleEnvContent =
    "NEXT_PUBLIC_FIREBASE_API_KEY=your_new_project_api_key\\n" +
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_new_project_auth_domain\\n" +
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_new_project_project_id\\n" +
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_new_project_storage_bucket\\n" +
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_new_project_messaging_sender_id\\n" +
    "NEXT_PUBLIC_FIREBASE_APP_ID=your_new_project_app_id\\n" +
    "(Optional) NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_new_project_measurement_id";

  throw new Error(
    "Firebase configuration is incomplete or uses placeholder values. " +
    "Please update the .env file in the root of your project " +
    "with your new Firebase project's credentials. For example:\\n" +
    exampleEnvContent + "\\n" +
    "You can find these credentials in your Firebase project settings after adding a web app."
  );
}

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
// let functions: Functions; // Uncomment if you re-add Firebase Functions

if (!getApps().length) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApp();
}

auth = getAuth(app);
db = getFirestore(app);
// functions = getFunctions(app); // Uncomment if you re-add Firebase Functions

export { app, auth, db, Timestamp }; // Add 'functions' here if uncommented
