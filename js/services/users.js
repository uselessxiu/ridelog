/**
 * User Document Service Layer
 * Manages Firestore `users/{clerkUserId}` document mapping.
 *
 * NOTE: Clerk is the ONLY authentication provider.
 * This service synchronizes profile metadata (name, email, timestamps) with Firestore
 * strictly indexed by the user's Clerk user ID.
 *
 * NO passwords, NO tokens, and NO Firebase Auth users are created or stored here.
 */

import { createUser } from '../models/types.js';
import { firebaseService } from './firebase.js';
import { FIRESTORE_COLLECTIONS } from '../config.js';

class UserService {
  constructor() {
    this._cachedUsers = new Map();
  }

  /**
   * Synchronize Clerk authenticated user profile into Firestore `users/{clerkUserId}`
   * @param {Object} clerkUser - RideLog user or Clerk user object
   * @returns {Promise<Object|null>}
   */
  async syncUserDocument(clerkUser) {
    if (!clerkUser) return null;

    const clerkUserId = clerkUser.clerkUserId || clerkUser.id;
    if (!clerkUserId) return null;

    const email = clerkUser.email || clerkUser.primaryEmailAddress?.emailAddress || '';
    const displayName = clerkUser.displayName || clerkUser.name || clerkUser.fullName ||
      clerkUser.firstName || (email ? email.split('@')[0] : 'Rider');

    const userDoc = createUser({
      clerkUserId,
      displayName,
      email,
      createdAt: clerkUser.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    this._cachedUsers.set(clerkUserId, userDoc);

    if (firebaseService.isReady()) {
      try {
        const { setDoc } = firebaseService.getFirestoreModule();
        const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.USERS, clerkUserId);
        await setDoc(docRef, {
          clerkUserId: userDoc.clerkUserId,
          displayName: userDoc.displayName,
          email: userDoc.email,
          updatedAt: userDoc.updatedAt,
          createdAt: userDoc.createdAt
        }, { merge: true });
        console.log(`[UserService] Synced user document for ${clerkUserId}`);
      } catch (err) {
        console.warn(`[UserService] Firestore sync failed for ${clerkUserId} (offline/permissions):`, err.message);
      }
    }

    return userDoc;
  }

  /**
   * Get user document by Clerk user ID
   * @param {string} clerkUserId
   * @returns {Promise<Object|null>}
   */
  async getUserDocument(clerkUserId) {
    if (!clerkUserId) return null;

    if (firebaseService.isReady()) {
      try {
        const { getDoc } = firebaseService.getFirestoreModule();
        const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.USERS, clerkUserId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const user = createUser({ ...docSnap.data(), clerkUserId: docSnap.id });
          this._cachedUsers.set(clerkUserId, user);
          return user;
        }
      } catch (err) {
        console.warn(`[UserService] Failed to get user document for ${clerkUserId}:`, err.message);
      }
    }

    if (this._cachedUsers.has(clerkUserId)) {
      return this._cachedUsers.get(clerkUserId);
    }

    return null;
  }
}

export const userService = new UserService();
