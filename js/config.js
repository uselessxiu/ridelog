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
  apiKey: (typeof window !== 'undefined' && window.FIREBASE_CONFIG?.apiKey) || '',
  authDomain: (typeof window !== 'undefined' && window.FIREBASE_CONFIG?.authDomain) || '',
  projectId: (typeof window !== 'undefined' && window.FIREBASE_CONFIG?.projectId) || '',
  storageBucket: (typeof window !== 'undefined' && window.FIREBASE_CONFIG?.storageBucket) || '',
  messagingSenderId: (typeof window !== 'undefined' && window.FIREBASE_CONFIG?.messagingSenderId) || '',
  appId: (typeof window !== 'undefined' && window.FIREBASE_CONFIG?.appId) || ''
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
