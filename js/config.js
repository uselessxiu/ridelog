/**
 * Application Configuration
 * Client-safe settings only.
 * NEVER put secret keys in this file.
 */

export const CLERK_PUBLISHABLE_KEY =
  (typeof window !== 'undefined' && window.CLERK_PUBLISHABLE_KEY) ||
  'pk_test_ZXZvbHZpbmctYnVycm8tMjQ1Mi5jbGVyay5hY2NvdW50cy5kZXYk';

export const CLERK_JS_URL =
  'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5.54.1/dist/clerk.browser.js';

/**
 * Firebase Firestore Configuration (Client-safe Web App credentials only)
 * DO NOT put private keys, service account JSON, or admin secrets here.
 * Populate these values from Firebase Console:
 * Project Settings > General > Your apps > Web app (</>)
 */
export const FIREBASE_CONFIG = {
  apiKey: (typeof window !== 'undefined' && (window.__ENV__?.FIREBASE_API_KEY || window.FIREBASE_CONFIG?.apiKey)) || "AIzaSyBIfqEZi2HmlWFLQVaStezS9y2Pr2NMJlA",
  authDomain: (typeof window !== 'undefined' && (window.__ENV__?.FIREBASE_AUTH_DOMAIN || window.FIREBASE_CONFIG?.authDomain)) || "ridelog-796ba.firebaseapp.com",
  projectId: (typeof window !== 'undefined' && (window.__ENV__?.FIREBASE_PROJECT_ID || window.FIREBASE_CONFIG?.projectId)) || "ridelog-796ba",
  storageBucket: (typeof window !== 'undefined' && (window.__ENV__?.FIREBASE_STORAGE_BUCKET || window.FIREBASE_CONFIG?.storageBucket)) || "ridelog-796ba.firebasestorage.app",
  messagingSenderId: (typeof window !== 'undefined' && (window.__ENV__?.FIREBASE_MESSAGING_SENDER_ID || window.FIREBASE_CONFIG?.messagingSenderId)) || "961069743496",
  appId: (typeof window !== 'undefined' && (window.__ENV__?.FIREBASE_APP_ID || window.FIREBASE_CONFIG?.appId)) || "1:961069743496:web:c51fa055b72a16405c4e3d",
  measurementId: (typeof window !== 'undefined' && (window.__ENV__?.FIREBASE_MEASUREMENT_ID || window.FIREBASE_CONFIG?.measurementId)) || "G-ETLG4LZN9T"
};

export const FIREBASE_SDK_VERSION = '10.13.2';

/**
 * Canonical Firestore Collection Names
 * Differentiates Global Catalogue collections from User-Owned collections.
 */
export const FIRESTORE_COLLECTIONS = {
  // Global Catalogue Data (Steps 4, 7, 8, 9, 14)
  MOTORCYCLE_MODELS: 'motorcycleModels',
  MOTORCYCLE_VARIANTS: 'motorcycleVariants',
  MAINTENANCE_SCHEDULES: 'maintenanceSchedules',

  // User-Owned Data (Steps 4, 5, 6, 12, 13)
  USERS: 'users',
  VEHICLES: 'vehicles',
  SERVICE_HISTORY: 'serviceHistory',
  RIDES: 'rides'
};
