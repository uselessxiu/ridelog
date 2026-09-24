/**
 * Firebase Firestore Service Layer
 * Official Modular Firebase Web SDK (v10) Browser/ESM Integration.
 * Isolates Firestore database connection, collection references, and configuration checks.
 *
 * NOTE: RIDELOG uses Clerk as its SOLE authentication provider.
 * Firebase Authentication is NOT imported or initialized.
 */

import { FIREBASE_CONFIG, FIREBASE_SDK_VERSION, FIRESTORE_COLLECTIONS } from '../config.js';

class FirebaseService {
  constructor() {
    this._app = null;
    this._db = null;
    this._firestoreModule = null;
    this._initialized = false;
    this._initPromise = null;
  }

  /**
   * Check if client-safe Firebase credentials have been populated
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(
      FIREBASE_CONFIG &&
      typeof FIREBASE_CONFIG.projectId === 'string' &&
      FIREBASE_CONFIG.projectId.trim() !== '' &&
      typeof FIREBASE_CONFIG.apiKey === 'string' &&
      FIREBASE_CONFIG.apiKey.trim() !== ''
    );
  }

  /**
   * Check if Firestore instance is ready for queries
   * @returns {boolean}
   */
  isReady() {
    return this._initialized && this._db !== null;
  }

  /**
   * Initialize Firebase App and Firestore SDK from official Google CDN
   * @returns {Promise<boolean>}
   */
  async initialize() {
    if (this._initialized) return this.isReady();
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      if (!this.isConfigured()) {
        console.info(
          '[FirebaseService] Firestore is not yet configured with project credentials. ' +
          'To connect live Firestore, add your Firebase Web App config to js/config.js. ' +
          'Operating in local repository mode.'
        );
        this._initialized = true;
        return false;
      }

      try {
        // Dynamically import official Firebase Web SDK modular browser bundles
        const appModuleUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`;
        const firestoreModuleUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`;

        const [appModule, firestoreModule] = await Promise.all([
          import(/* webpackIgnore: true */ appModuleUrl),
          import(/* webpackIgnore: true */ firestoreModuleUrl)
        ]);

        const { initializeApp, getApps, getApp } = appModule;
        const { getFirestore } = firestoreModule;

        // Initialize Firebase App singleton safely
        const existingApps = getApps();
        this._app = existingApps.length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
        this._db = getFirestore(this._app);
        this._firestoreModule = firestoreModule;

        this._initialized = true;
        console.log(`[FirebaseService] Firestore connected successfully (Project: ${FIREBASE_CONFIG.projectId}).`);
        return true;
      } catch (err) {
        console.error('[FirebaseService] Failed to initialize Firestore SDK:', err);
        this._app = null;
        this._db = null;
        this._firestoreModule = null;
        this._initialized = true;
        return false;
      }
    })();

    return this._initPromise;
  }

  /**
   * Return initialized Firestore database instance or null
   * @returns {Object|null}
   */
  getDb() {
    return this._db;
  }

  /**
   * Return loaded Firestore SDK module exports (collection, doc, query, where, etc.)
   * @returns {Object|null}
   */
  getFirestoreModule() {
    return this._firestoreModule;
  }

  /**
   * Helper to get a Firestore collection reference
   * @param {string} collectionName
   * @returns {Object|null}
   */
  getCollectionRef(collectionName) {
    if (!this.isReady() || !this._firestoreModule) return null;
    const { collection } = this._firestoreModule;
    return collection(this._db, collectionName);
  }

  /**
   * Helper to get a Firestore document reference
   * @param {string} collectionName
   * @param {string} docId
   * @returns {Object|null}
   */
  getDocRef(collectionName, docId) {
    if (!this.isReady() || !this._firestoreModule) return null;
    const { doc } = this._firestoreModule;
    return doc(this._db, collectionName, docId);
  }

  /**
   * Return canonical collection names map
   */
  get collections() {
    return FIRESTORE_COLLECTIONS;
  }
}

export const firebaseService = new FirebaseService();
