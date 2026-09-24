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
    this._analytics = null;
    this._firestoreModule = null;
    this._analyticsModule = null;
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
   * Initialize Firebase App, Firestore, and Analytics SDK from official Google CDN
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
        const analyticsModuleUrl = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-analytics.js`;

        const [appModule, firestoreModule, analyticsModule] = await Promise.all([
          import(/* webpackIgnore: true */ appModuleUrl),
          import(/* webpackIgnore: true */ firestoreModuleUrl),
          import(/* webpackIgnore: true */ analyticsModuleUrl).catch(err => {
            console.warn('[FirebaseService] Analytics bundle skipped or unavailable:', err?.message);
            return null;
          })
        ]);

        const { initializeApp, getApps, getApp } = appModule;
        const { getFirestore } = firestoreModule;

        // Initialize Firebase App singleton safely
        const existingApps = getApps();
        this._app = existingApps.length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
        this._db = getFirestore(this._app);
        this._firestoreModule = firestoreModule;

        // Initialize Firebase Analytics if supported in the current environment
        if (analyticsModule && typeof analyticsModule.isSupported === 'function') {
          try {
            const supported = await analyticsModule.isSupported();
            if (supported) {
              this._analytics = analyticsModule.getAnalytics(this._app);
              this._analyticsModule = analyticsModule;
            }
          } catch (analyticsErr) {
            console.warn('[FirebaseService] Analytics is not supported in this runtime environment:', analyticsErr?.message);
          }
        }

        this._initialized = true;
        console.log(`[FirebaseService] Firebase & Firestore connected successfully (Project: ${FIREBASE_CONFIG.projectId}).`);
        return true;
      } catch (err) {
        console.error('[FirebaseService] Failed to initialize Firebase SDK:', err);
        this._app = null;
        this._db = null;
        this._analytics = null;
        this._firestoreModule = null;
        this._initialized = true;
        return false;
      }
    })();

    return this._initPromise;
  }

  /**
   * Return initialized Firebase App instance or null
   * @returns {Object|null}
   */
  getApp() {
    return this._app;
  }

  /**
   * Return initialized Firestore database instance or null
   * @returns {Object|null}
   */
  getDb() {
    return this._db;
  }

  /**
   * Return initialized Firebase Analytics instance or null
   * @returns {Object|null}
   */
  getAnalytics() {
    return this._analytics;
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
   * Fetch a single document by ID
   * @param {string} collectionName
   * @param {string} docId
   * @returns {Promise<Object|null>}
   */
  async getDocument(collectionName, docId) {
    if (!this.isReady() || !this._firestoreModule) return null;
    const { getDoc, doc } = this._firestoreModule;
    const docRef = doc(this._db, collectionName, docId);
    const snap = await getDoc(docRef);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  }

  /**
   * Write or merge a document with a specified ID
   * @param {string} collectionName
   * @param {string} docId
   * @param {Object} data
   * @param {boolean} [merge=true]
   * @returns {Promise<Object>}
   */
  async setDocument(collectionName, docId, data, merge = true) {
    if (!this.isReady() || !this._firestoreModule) {
      throw new Error('Firestore is not initialized');
    }
    const { setDoc, doc } = this._firestoreModule;
    const docRef = doc(this._db, collectionName, docId);
    await setDoc(docRef, data, { merge });
    return { id: docId, ...data };
  }

  /**
   * Add a new document with an auto-generated ID
   * @param {string} collectionName
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async addDocument(collectionName, data) {
    if (!this.isReady() || !this._firestoreModule) {
      throw new Error('Firestore is not initialized');
    }
    const { addDoc, collection } = this._firestoreModule;
    const colRef = collection(this._db, collectionName);
    const docRef = await addDoc(colRef, data);
    return { id: docRef.id, ...data };
  }

  /**
   * Update specific fields of an existing document
   * @param {string} collectionName
   * @param {string} docId
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async updateDocument(collectionName, docId, data) {
    if (!this.isReady() || !this._firestoreModule) {
      throw new Error('Firestore is not initialized');
    }
    const { updateDoc, doc } = this._firestoreModule;
    const docRef = doc(this._db, collectionName, docId);
    await updateDoc(docRef, data);
    return { id: docId, ...data };
  }

  /**
   * Delete a document by ID
   * @param {string} collectionName
   * @param {string} docId
   * @returns {Promise<boolean>}
   */
  async deleteDocument(collectionName, docId) {
    if (!this.isReady() || !this._firestoreModule) {
      throw new Error('Firestore is not initialized');
    }
    const { deleteDoc, doc } = this._firestoreModule;
    const docRef = doc(this._db, collectionName, docId);
    await deleteDoc(docRef);
    return true;
  }

  /**
   * Query documents from a collection with optional constraints
   * @param {string} collectionName
   * @param {Array} [constraints=[]]
   * @returns {Promise<Array<Object>>}
   */
  async queryDocuments(collectionName, constraints = []) {
    if (!this.isReady() || !this._firestoreModule) return [];
    const { collection, query, getDocs } = this._firestoreModule;
    const colRef = collection(this._db, collectionName);
    const q = constraints.length > 0 ? query(colRef, ...constraints) : colRef;
    const snap = await getDocs(q);
    const results = [];
    snap.forEach(docSnap => {
      results.push({ id: docSnap.id, ...docSnap.data() });
    });
    return results;
  }

  /**
   * Retrieve all documents from a collection
   * @param {string} collectionName
   * @returns {Promise<Array<Object>>}
   */
  async getCollection(collectionName) {
    return this.queryDocuments(collectionName);
  }

  /**
   * Return canonical collection names map
   */
  get collections() {
    return FIRESTORE_COLLECTIONS;
  }
}

export const firebaseService = new FirebaseService();
