/**
 * Vehicles Service Layer
 * Multi-user vehicle repository and abstraction layer for Firebase Firestore.
 * Conforms to Step 6 (Vehicle Model) & Step 11 (Vehicle Service API).
 *
 * Exposes:
 * - createVehicle(vehicleData, ownerId) / addVehicle(...)
 * - getUserVehicles(ownerId) / getVehicles(...)
 * - getVehicleById(id)
 * - updateVehicle(id, updates)
 * - deleteVehicle(id, ownerId)
 * - setActiveVehicle(id) / setActiveVehicleId(...)
 * - getActiveVehicle(ownerId)
 *
 * Every operation associates documents with the authenticated Clerk user (`ownerId`).
 * The UI never executes direct Firestore calls.
 */

import { createVehicle } from '../models/types.js';
import { authService } from './auth.js';
import { storage } from '../storage.js';
import { firebaseService } from './firebase.js';
import { FIRESTORE_COLLECTIONS } from '../config.js';

class VehicleService {
  /**
   * Helper to resolve active Clerk owner ID
   * @param {string} [ownerId]
   * @returns {string}
   */
  _resolveOwnerId(ownerId) {
    return ownerId || authService.getClerkUserId() || authService.getUserId() || 'user_demo_rajarshee';
  }

  /**
   * Step 11: Get all vehicles belonging to a specific Clerk user
   * @param {string} [ownerId]
   * @returns {Array<Object>}
   */
  getUserVehicles(ownerId = this._resolveOwnerId()) {
    if (!ownerId) return [];
    const all = storage.getMotorcycles();
    const userVehicles = all.filter(v => (v.ownerId || v.userId || 'user_demo_rajarshee') === ownerId);
    return userVehicles.map(v => createVehicle(v));
  }

  /**
   * Alias for getUserVehicles for backward compatibility
   */
  getVehicles(ownerId) {
    return this.getUserVehicles(ownerId);
  }

  /**
   * Step 11: Get single vehicle by ID
   * @param {string} id
   * @returns {Object|null}
   */
  getVehicleById(id) {
    if (!id) return null;
    const all = storage.getMotorcycles();
    const found = all.find(v => v.id === id);
    return found ? createVehicle(found) : null;
  }

  /**
   * Step 11: Get the active vehicle for the user
   * @param {string} [ownerId]
   * @returns {Object|null}
   */
  getActiveVehicle(ownerId = this._resolveOwnerId()) {
    const vehicles = this.getUserVehicles(ownerId);
    if (vehicles.length === 0) return null;

    const activeId = storage.getActiveBikeId();
    const active = vehicles.find(v => v.id === activeId);
    return active || vehicles[0];
  }

  /**
   * Get the active vehicle ID
   * @returns {string|null}
   */
  getActiveVehicleId() {
    return storage.getActiveBikeId();
  }

  /**
   * Step 11: Set the active vehicle ID
   * @param {string} id
   * @returns {boolean}
   */
  setActiveVehicle(id) {
    const success = storage.setActiveBikeId(id);
    return Boolean(success);
  }

  /**
   * Alias for setActiveVehicle for backward compatibility
   */
  setActiveVehicleId(id) {
    return this.setActiveVehicle(id);
  }

  /**
   * Step 6 & 11: Create a new vehicle for a user
   * @param {Object} vehicleData
   * @param {string} [ownerId]
   * @returns {Object}
   */
  createVehicle(vehicleData, ownerId = this._resolveOwnerId()) {
    const vehicle = createVehicle({
      ...vehicleData,
      ownerId: ownerId,
      userId: ownerId
    });

    // 1. Persist to local storage cache immediately (instant UI response)
    const all = storage.getMotorcycles();
    all.push(vehicle);
    storage.saveMotorcycles(all);

    // If this is user's only vehicle, set it as active
    const userVehicles = this.getUserVehicles(ownerId);
    if (userVehicles.length === 1) {
      this.setActiveVehicle(vehicle.id);
    }

    // 2. Persist to Firestore `vehicles/{vehicleId}` if connected
    if (firebaseService.isReady()) {
      (async () => {
        try {
          const { setDoc } = firebaseService.getFirestoreModule();
          const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.VEHICLES, vehicle.id);
          await setDoc(docRef, {
            ownerId: vehicle.ownerId,
            brandId: vehicle.brandId,
            modelId: vehicle.modelId,
            variantId: vehicle.variantId,
            modelYear: vehicle.modelYear,
            nickname: vehicle.nickname,
            registrationNumber: vehicle.registrationNumber,
            currentOdometer: vehicle.currentOdometer,
            purchaseDate: vehicle.purchaseDate,
            image: vehicle.image,
            isActive: vehicle.isActive,
            createdAt: vehicle.createdAt,
            updatedAt: vehicle.updatedAt
          });
          console.log(`[VehicleService] Vehicle ${vehicle.id} created in Firestore`);
        } catch (err) {
          console.warn(`[VehicleService] Firestore create failed for vehicle ${vehicle.id}:`, err.message);
        }
      })();
    }

    return vehicle;
  }

  /**
   * Alias for createVehicle for backward compatibility
   */
  addVehicle(vehicleData, ownerId) {
    return this.createVehicle(vehicleData, ownerId);
  }

  /**
   * Step 11: Update an existing vehicle
   * @param {string} id
   * @param {Object} updates
   * @returns {boolean}
   */
  updateVehicle(id, updates) {
    const all = storage.getMotorcycles();
    const idx = all.findIndex(v => v.id === id);
    if (idx === -1) return false;

    const updated = createVehicle({
      ...all[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    });

    all[idx] = updated;
    storage.saveMotorcycles(all);

    // Sync to Firestore if connected
    if (firebaseService.isReady()) {
      (async () => {
        try {
          const { updateDoc } = firebaseService.getFirestoreModule();
          const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.VEHICLES, id);
          await updateDoc(docRef, {
            ...updates,
            updatedAt: updated.updatedAt
          });
          console.log(`[VehicleService] Vehicle ${id} updated in Firestore`);
        } catch (err) {
          console.warn(`[VehicleService] Firestore update failed for vehicle ${id}:`, err.message);
        }
      })();
    }

    return true;
  }

  /**
   * Step 11: Delete a vehicle by ID
   * @param {string} id
   * @param {string} [ownerId]
   * @returns {boolean}
   */
  deleteVehicle(id, ownerId = this._resolveOwnerId()) {
    const all = storage.getMotorcycles();
    const filtered = all.filter(v => v.id !== id);
    storage.saveMotorcycles(filtered);

    // If deleted vehicle was active, select next available for this user
    if (storage.getActiveBikeId() === id) {
      const remaining = this.getUserVehicles(ownerId);
      if (remaining.length > 0) {
        this.setActiveVehicle(remaining[0].id);
      } else {
        localStorage.removeItem('ridelog_active_bike_id');
      }
    }

    // Delete from Firestore if connected
    if (firebaseService.isReady()) {
      (async () => {
        try {
          const { deleteDoc } = firebaseService.getFirestoreModule();
          const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.VEHICLES, id);
          await deleteDoc(docRef);
          console.log(`[VehicleService] Vehicle ${id} deleted from Firestore`);
        } catch (err) {
          console.warn(`[VehicleService] Firestore delete failed for vehicle ${id}:`, err.message);
        }
      })();
    }

    return true;
  }

  /**
   * Synchronize user vehicles from Firestore into local cache on login
   * @param {string} [ownerId]
   * @returns {Promise<Array<Object>>}
   */
  async syncWithFirestore(ownerId = this._resolveOwnerId()) {
    if (!firebaseService.isReady() || !ownerId) {
      return this.getUserVehicles(ownerId);
    }

    try {
      const { getDocs, query, where } = firebaseService.getFirestoreModule();
      const colRef = firebaseService.getCollectionRef(FIRESTORE_COLLECTIONS.VEHICLES);
      const q = query(colRef, where('ownerId', '==', ownerId));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const firestoreVehicles = [];
        snapshot.forEach(docSnap => {
          firestoreVehicles.push(createVehicle({ ...docSnap.data(), id: docSnap.id }));
        });

        // Merge into local storage cache
        const all = storage.getMotorcycles().filter(v => (v.ownerId || v.userId) !== ownerId);
        const merged = [...all, ...firestoreVehicles];
        storage.saveMotorcycles(merged);
        console.log(`[VehicleService] Synced ${firestoreVehicles.length} vehicles from Firestore`);
        return firestoreVehicles;
      }
    } catch (err) {
      console.warn('[VehicleService] Firestore vehicles sync failed (offline/fallback):', err.message);
    }

    return this.getUserVehicles(ownerId);
  }

  /**
   * Get the display image URL for a vehicle.
   * Prioritizes user-uploaded images, falls back to appropriate brand assets.
   * @param {Object} vehicle
   * @returns {string}
   */
  getVehicleImage(vehicle) {
    if (!vehicle) return 'assets/hunter-350.jpg';
    if (vehicle.image && vehicle.image.trim() !== '') return vehicle.image;
    if (vehicle.imageUrl && vehicle.imageUrl.trim() !== '') return vehicle.imageUrl;
    const name = (vehicle.nickname || vehicle.model || vehicle.name || '').toLowerCase();
    if (name.includes('duke')) return 'assets/duke-390.jpg';
    return 'assets/hunter-350.jpg';
  }

  /**
   * Check if vehicle has a custom uploaded picture
   * @param {Object} vehicle
   * @returns {boolean}
   */
  hasCustomImage(vehicle) {
    if (!vehicle) return false;
    const img = vehicle.image || vehicle.imageUrl || '';
    return Boolean(img && !img.startsWith('assets/'));
  }
}

export const vehicleService = new VehicleService();
