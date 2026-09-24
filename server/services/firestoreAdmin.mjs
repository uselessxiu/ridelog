/**
 * Server-Side Firestore Access Layer
 * Performs privileged writes and reads for master catalogue (`bikeModels`),
 * user profiles (`users/{clerkUserId}`), and user bike references (`users/{clerkUserId}/userBikes/{userBikeId}`).
 *
 * Keeps client-side Firestore locked down (`allow write: if false;`).
 * Operates via Firebase Admin SDK or Google Cloud Firestore REST API.
 * Provides resilient development fallback when credentials are not yet wired in server/.env.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class FirestoreAdmin {
  constructor() {
    this._projectId = process.env.FIREBASE_PROJECT_ID || 'ridelog-796ba';
    this._serviceAccount = null;
    this._accessToken = null;
    this._tokenExpiry = 0;
    this._devStore = {
      bikeModels: new Map(),
      users: new Map(),
      userBikes: new Map() // key: `${clerkUserId}:${userBikeId}`
    };

    this._initServiceAccount();
  }

  /**
   * Load service account if specified in env
   */
  _initServiceAccount() {
    if (this._serviceAccount) return this._serviceAccount;

    // 1. Production Render: direct JSON string in environment variable
    const jsonStringEnv = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (jsonStringEnv && jsonStringEnv.trim()) {
      try {
        const parsed = JSON.parse(jsonStringEnv.trim());
        if (parsed && typeof parsed === 'object') {
          this._serviceAccount = parsed;
          this._projectId = this._serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || this._projectId;
          console.log(`[FirestoreAdmin] Service account initialized from FIREBASE_SERVICE_ACCOUNT_JSON for project: ${this._projectId}`);
          return this._serviceAccount;
        }
      } catch (err) {
        console.warn('[FirestoreAdmin] Could not parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
      }
    }

    const b64Cred = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    let credPath = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_APPLICATION_CREDENTIALS;

    if (!b64Cred && !credPath) {
      const candidates = [
        path.resolve(__dirname, '..', 'serviceAccountKey.json'),
        path.resolve(process.cwd(), 'server', 'serviceAccountKey.json'),
        path.resolve(process.cwd(), 'serviceAccountKey.json'),
        path.resolve(__dirname, '..', '..', 'serviceAccountKey.json')
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          credPath = p;
          break;
        }
      }
    }

    if (!b64Cred && !credPath) {
      return null;
    }

    try {
      let rawJson = null;
      if (b64Cred) {
        rawJson = Buffer.from(b64Cred.trim(), 'base64').toString('utf8');
      } else if (credPath.trim().startsWith('{')) {
        rawJson = credPath;
      } else {
        const resolvedPath = path.isAbsolute(credPath) ? credPath : path.resolve(process.cwd(), credPath);
        if (fs.existsSync(resolvedPath)) {
          rawJson = fs.readFileSync(resolvedPath, 'utf8');
        } else {
          // Also try relative to project root or server dir
          const serverRel = path.resolve(process.cwd(), 'server', credPath);
          if (fs.existsSync(serverRel)) {
            rawJson = fs.readFileSync(serverRel, 'utf8');
          }
        }
      }

      if (rawJson) {
        this._serviceAccount = JSON.parse(rawJson);
        this._projectId = this._serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || this._projectId;
        console.log(`[FirestoreAdmin] Service account successfully authenticated for project: ${this._projectId}`);
        return this._serviceAccount;
      }
    } catch (err) {
      console.warn('[FirestoreAdmin] Could not load service account JSON:', err.message);
      this._serviceAccount = null;
    }
    return null;
  }

  /**
   * Check if live Firestore is configured with service account
   * @returns {boolean}
   */
  isLiveConfigured() {
    return Boolean(this._serviceAccount || this._initServiceAccount());
  }

  /**
   * Exchange service account JWT for Google OAuth2 access token
   * @returns {Promise<string|null>}
   */
  async _getAccessToken() {
    if (!this._serviceAccount) {
      this._initServiceAccount();
    }
    if (!this._serviceAccount) return null;

    const now = Math.floor(Date.now() / 1000);
    if (this._accessToken && now < this._tokenExpiry - 60) {
      return this._accessToken;
    }

    try {
      const header = { alg: 'RS256', typ: 'JWT' };
      const claim = {
        iss: this._serviceAccount.client_email,
        scope: 'https://www.googleapis.com/auth/datastore',
        aud: 'https://oauth2.googleapis.com/token',
        exp: now + 3600,
        iat: now
      };

      const b64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
      const unsignedToken = `${b64Url(header)}.${b64Url(claim)}`;

      const signer = crypto.createSign('RSA-SHA256');
      signer.update(unsignedToken);
      const signature = signer.sign(this._serviceAccount.private_key, 'base64url');
      const jwt = `${unsignedToken}.${signature}`;

      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: jwt
        })
      });

      if (!res.ok) {
        throw new Error(`Token exchange failed with status ${res.status}`);
      }

      const data = await res.json();
      this._accessToken = data.access_token;
      this._tokenExpiry = now + (data.expires_in || 3600);
      return this._accessToken;
    } catch (err) {
      console.warn('[FirestoreAdmin] OAuth2 token exchange error:', err.message);
      return null;
    }
  }

  // Convert JS object to Firestore REST API fields format
  _toFirestoreValue(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === 'boolean') return { booleanValue: val };
    if (typeof val === 'number') {
      return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    }
    if (typeof val === 'string') return { stringValue: val };
    if (Array.isArray(val)) {
      return { arrayValue: { values: val.map(item => this._toFirestoreValue(item)) } };
    }
    if (typeof val === 'object') {
      const fields = {};
      for (const [k, v] of Object.entries(val)) {
        fields[k] = this._toFirestoreValue(v);
      }
      return { mapValue: { fields } };
    }
    return { stringValue: String(val) };
  }

  // Convert Firestore REST API fields format back to plain JS object
  _fromFirestoreValue(val) {
    if (!val) return null;
    if ('nullValue' in val) return null;
    if ('booleanValue' in val) return val.booleanValue;
    if ('integerValue' in val) return parseInt(val.integerValue, 10);
    if ('doubleValue' in val) return parseFloat(val.doubleValue);
    if ('stringValue' in val) return val.stringValue;
    if ('arrayValue' in val) {
      return (val.arrayValue.values || []).map(item => this._fromFirestoreValue(item));
    }
    if ('mapValue' in val) {
      const res = {};
      const fields = val.mapValue.fields || {};
      for (const [k, v] of Object.entries(fields)) {
        res[k] = this._fromFirestoreValue(v);
      }
      return res;
    }
    return null;
  }

  /**
   * 1. Get a master motorcycle model by ID from `bikeModels/{bikeModelId}`
   * @param {string} bikeModelId
   * @returns {Promise<Object|null>}
   */
  async getBikeModel(bikeModelId) {
    if (!bikeModelId) return null;
    const cleanId = bikeModelId.toLowerCase().trim();

    // Check dev store first
    if (this._devStore.bikeModels.has(cleanId)) {
      return { id: cleanId, ...this._devStore.bikeModels.get(cleanId) };
    }

    const token = await this._getAccessToken();
    if (!token) return null;

    try {
      const url = `https://firestore.googleapis.com/v1/projects/${this._projectId}/databases/(default)/documents/bikeModels/${encodeURIComponent(cleanId)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Firestore read error: ${res.status}`);

      const doc = await res.json();
      const data = {};
      for (const [k, v] of Object.entries(doc.fields || {})) {
        data[k] = this._fromFirestoreValue(v);
      }
      return { id: cleanId, ...data };
    } catch (err) {
      console.warn(`[FirestoreAdmin] getBikeModel (${cleanId}) error:`, err.message);
      return null;
    }
  }

  /**
   * 2. Search existing bike models in master catalogue by brand and model
   * @param {string} brand
   * @param {string} model
   * @param {number|null} [year]
   * @returns {Promise<Object|null>}
   */
  async findMatchingBikeModel(brand, model, year) {
    if (!brand || !model) return null;
    const cleanBrand = brand.toLowerCase().trim();
    const cleanModel = model.toLowerCase().trim();

    // Check exact id format: {brand}-{model}-{year}
    if (year) {
      const expectedId = `${cleanBrand}-${cleanModel}-${year}`.replace(/[\s_]+/g, '-');
      const direct = await this.getBikeModel(expectedId);
      if (direct) return direct;
    }

    // Check dev store for matching brand and model
    for (const [id, bike] of this._devStore.bikeModels.entries()) {
      const bBrand = (bike.brand || '').toLowerCase().trim();
      const bModel = (bike.model || '').toLowerCase().trim();
      if (bBrand.includes(cleanBrand) && bModel.includes(cleanModel)) {
        if (!year || bike.year === year) {
          return { id, ...bike };
        }
      }
    }

    return null;
  }

  /**
   * 3. Save or update a master motorcycle model in `bikeModels/{bikeModelId}`
   * @param {string} bikeModelId
   * @param {Object} data
   * @returns {Promise<Object>}
   */
  async saveBikeModel(bikeModelId, data) {
    const cleanId = bikeModelId.toLowerCase().trim();
    const payload = {
      ...data,
      updatedAt: new Date().toISOString()
    };

    // Always keep updated in local dev store
    this._devStore.bikeModels.set(cleanId, payload);

    const token = await this._getAccessToken();
    if (token) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${this._projectId}/databases/(default)/documents/bikeModels/${encodeURIComponent(cleanId)}`;
        const fields = {};
        for (const [k, v] of Object.entries(payload)) {
          fields[k] = this._toFirestoreValue(v);
        }

        const res = await fetch(url, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields })
        });

        if (!res.ok) {
          throw new Error(`Firestore save error: ${res.status}`);
        }
        console.log(`[FirestoreAdmin] Saved master bike model: ${cleanId} to Firestore.`);
      } catch (err) {
        console.warn(`[FirestoreAdmin] Live Firestore save failed for ${cleanId}:`, err.message);
      }
    }

    return { id: cleanId, ...payload };
  }

  /**
   * 4. Upsert user document `users/{clerkUserId}`
   * @param {string} clerkUserId
   * @param {Object} userData
   * @returns {Promise<Object>}
   */
  async upsertUser(clerkUserId, userData = {}) {
    if (!clerkUserId) throw new Error('clerkUserId is required');

    const payload = {
      clerkUserId,
      name: userData.name || '',
      email: userData.email || '',
      updatedAt: new Date().toISOString()
    };

    if (!this._devStore.users.has(clerkUserId)) {
      payload.createdAt = new Date().toISOString();
    } else {
      payload.createdAt = this._devStore.users.get(clerkUserId).createdAt;
    }

    this._devStore.users.set(clerkUserId, payload);

    const token = await this._getAccessToken();
    if (token) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${this._projectId}/databases/(default)/documents/users/${encodeURIComponent(clerkUserId)}`;
        const fields = {};
        for (const [k, v] of Object.entries(payload)) {
          fields[k] = this._toFirestoreValue(v);
        }

        await fetch(url, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields })
        });
      } catch (err) {
        console.warn(`[FirestoreAdmin] Live user upsert failed for ${clerkUserId}:`, err.message);
      }
    }

    return payload;
  }

  /**
   * 5. Add user bike reference `users/{clerkUserId}/userBikes/{userBikeId}`
   * @param {string} clerkUserId
   * @param {Object} userBikeData
   * @returns {Promise<Object>}
   */
  async addUserBike(clerkUserId, userBikeData) {
    if (!clerkUserId) throw new Error('clerkUserId is required');
    if (!userBikeData.bikeModelId) throw new Error('bikeModelId is required');

    const userBikeId = userBikeData.id || `ub_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();

    const payload = {
      id: userBikeId,
      bikeModelId: userBikeData.bikeModelId,
      nickname: userBikeData.nickname || '',
      registrationNumber: userBikeData.registrationNumber || '',
      purchaseDate: userBikeData.purchaseDate || null,
      currentOdometer: Number(userBikeData.currentOdometer) || 0,
      notes: userBikeData.notes || '',
      createdAt: now,
      updatedAt: now
    };

    const storeKey = `${clerkUserId}:${userBikeId}`;
    this._devStore.userBikes.set(storeKey, payload);

    const token = await this._getAccessToken();
    if (token) {
      try {
        const url = `https://firestore.googleapis.com/v1/projects/${this._projectId}/databases/(default)/documents/users/${encodeURIComponent(clerkUserId)}/userBikes/${encodeURIComponent(userBikeId)}`;
        const fields = {};
        for (const [k, v] of Object.entries(payload)) {
          fields[k] = this._toFirestoreValue(v);
        }

        await fetch(url, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ fields })
        });
        console.log(`[FirestoreAdmin] Created userBike ${userBikeId} for user ${clerkUserId}`);
      } catch (err) {
        console.warn(`[FirestoreAdmin] Live userBike write failed for ${userBikeId}:`, err.message);
      }
    }

    return payload;
  }
}

export const firestoreAdmin = new FirestoreAdmin();
