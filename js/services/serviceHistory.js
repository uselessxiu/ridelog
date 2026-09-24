/**
 * Service History & Rides Service Layer
 * Multi-user trip log and service history abstraction layer for Firebase Firestore.
 * Conforms to Step 12 (Service History Model) and Step 13 (Rides Model).
 *
 * All operations map user ownership to Clerk user ID (`ownerId`).
 */

import { authService } from './auth.js';
import { vehicleService } from './vehicles.js';
import { storage } from '../storage.js';
import { createRide, createServiceHistory } from '../models/types.js';
import { firebaseService } from './firebase.js';
import { FIRESTORE_COLLECTIONS } from '../config.js';

class ServiceHistoryService {
  /**
   * Helper to resolve active Clerk owner ID
   * @param {string} [ownerId]
   * @returns {string}
   */
  _resolveOwnerId(ownerId) {
    return ownerId || authService.getClerkUserId() || authService.getUserId() || 'user_demo_rajarshee';
  }

  // ==========================================
  // RIDES REPOSITORY (Step 13)
  // Collection: rides/{rideId}
  // ==========================================

  /**
   * Get rides for a specific vehicle and user
   * @param {string} vehicleId
   * @param {string} [ownerId]
   * @returns {Array<Object>}
   */
  getRides(vehicleId, ownerId = this._resolveOwnerId()) {
    if (!vehicleId) return [];
    const all = storage.getRides();
    return all
      .filter(r => {
        const matchVehicle = (r.vehicleId || r.bikeId) === vehicleId;
        const recordOwner = r.ownerId || r.userId || 'user_demo_rajarshee';
        const matchUser = !ownerId || recordOwner === ownerId || recordOwner === 'user_demo_rajarshee';
        return matchVehicle && matchUser;
      })
      .map(r => createRide(r));
  }

  /**
   * Get all rides for a user across all vehicles
   * @param {string} [ownerId]
   * @returns {Array<Object>}
   */
  getAllRides(ownerId = this._resolveOwnerId()) {
    const all = storage.getRides();
    if (!ownerId) return all.map(r => createRide(r));
    return all
      .filter(r => {
        const recordOwner = r.ownerId || r.userId || 'user_demo_rajarshee';
        return recordOwner === ownerId || recordOwner === 'user_demo_rajarshee';
      })
      .map(r => createRide(r));
  }

  /**
   * Get ride by ID
   * @param {string} id
   * @returns {Object|null}
   */
  getRideById(id) {
    if (!id) return null;
    const all = storage.getRides();
    const found = all.find(r => r.id === id);
    return found ? createRide(found) : null;
  }

  /**
   * Step 13: Add a new ride log
   * @param {Object} rideData
   * @param {string} [ownerId]
   * @returns {Object}
   */
  addRide(rideData, ownerId = this._resolveOwnerId()) {
    const vehicleId = rideData.vehicleId || rideData.bikeId;

    const ride = createRide({
      ...rideData,
      ownerId,
      userId: ownerId,
      vehicleId,
      bikeId: vehicleId
    });

    const all = storage.getRides();
    all.unshift(ride);
    storage.saveRides(all);

    // Sync vehicle's current odometer if this ride's endKm is higher
    if (vehicleId && rideData.endKm) {
      const bike = vehicleService.getVehicleById(vehicleId);
      if (bike && Number(rideData.endKm) > (Number(bike.currentOdometer) || 0)) {
        vehicleService.updateVehicle(vehicleId, { currentOdometer: Number(rideData.endKm) });
      }
    }

    // Persist to Firestore if connected
    if (firebaseService.isReady()) {
      (async () => {
        try {
          const { setDoc } = firebaseService.getFirestoreModule();
          const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.RIDES, ride.id);
          await setDoc(docRef, {
            ownerId: ride.ownerId,
            vehicleId: ride.vehicleId,
            date: ride.date,
            distanceKm: ride.distanceKm,
            duration: ride.duration,
            startLocation: ride.startLocation,
            destination: ride.destination,
            notes: ride.notes,
            fuelCost: ride.fuelCost,
            createdAt: ride.createdAt
          });
          console.log(`[ServiceHistoryService] Ride ${ride.id} saved to Firestore`);
        } catch (err) {
          console.warn(`[ServiceHistoryService] Firestore write failed for ride ${ride.id}:`, err.message);
        }
      })();
    }

    return ride;
  }

  /**
   * Update an existing ride
   * @param {string} id
   * @param {Object} updates
   * @returns {boolean}
   */
  updateRide(id, updates) {
    const all = storage.getRides();
    const idx = all.findIndex(r => r.id === id);
    if (idx === -1) return false;

    const updated = createRide({
      ...all[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    });

    all[idx] = updated;
    storage.saveRides(all);

    const vehicleId = updated.vehicleId;
    if (vehicleId && updates.endKm) {
      const bike = vehicleService.getVehicleById(vehicleId);
      if (bike && Number(updates.endKm) > (Number(bike.currentOdometer) || 0)) {
        vehicleService.updateVehicle(vehicleId, { currentOdometer: Number(updates.endKm) });
      }
    }

    if (firebaseService.isReady()) {
      (async () => {
        try {
          const { updateDoc } = firebaseService.getFirestoreModule();
          const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.RIDES, id);
          await updateDoc(docRef, { ...updates, updatedAt: updated.updatedAt });
        } catch (err) {
          console.warn(`[ServiceHistoryService] Firestore update failed for ride ${id}:`, err.message);
        }
      })();
    }

    return true;
  }

  /**
   * Delete a ride by ID
   * @param {string} id
   * @returns {boolean}
   */
  deleteRide(id) {
    const all = storage.getRides();
    const filtered = all.filter(r => r.id !== id);
    storage.saveRides(filtered);

    if (firebaseService.isReady()) {
      (async () => {
        try {
          const { deleteDoc } = firebaseService.getFirestoreModule();
          const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.RIDES, id);
          await deleteDoc(docRef);
        } catch (err) {
          console.warn(`[ServiceHistoryService] Firestore delete failed for ride ${id}:`, err.message);
        }
      })();
    }

    return true;
  }

  // ==========================================
  // SERVICE HISTORY REPOSITORY (Step 12)
  // Collection: serviceHistory/{serviceId}
  // ==========================================

  /**
   * Step 12: Add a new service history record
   * @param {Object} recordData
   * @param {string} [ownerId]
   * @returns {Object}
   */
  addServiceRecord(recordData, ownerId = this._resolveOwnerId()) {
    const record = createServiceHistory({
      ...recordData,
      ownerId,
      userId: ownerId
    });

    const all = storage.getMaintenanceHistory();
    all.unshift(record);
    storage.saveMaintenanceHistory(all);

    if (firebaseService.isReady()) {
      (async () => {
        try {
          const { setDoc } = firebaseService.getFirestoreModule();
          const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.SERVICE_HISTORY, record.id);
          await setDoc(docRef, {
            ownerId: record.ownerId,
            vehicleId: record.vehicleId,
            serviceType: record.serviceType,
            date: record.date,
            odometer: record.odometer,
            workshop: record.workshop,
            cost: record.cost,
            notes: record.notes,
            parts: record.parts,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
          });
          console.log(`[ServiceHistoryService] Service record ${record.id} saved to Firestore`);
        } catch (err) {
          console.warn(`[ServiceHistoryService] Firestore write failed for service ${record.id}:`, err.message);
        }
      })();
    }

    return record;
  }

  /**
   * Step 12: Get service history records for a vehicle
   * @param {string} vehicleId
   * @param {string} [ownerId]
   * @returns {Array<Object>}
   */
  getServiceHistory(vehicleId, ownerId = this._resolveOwnerId()) {
    if (!vehicleId) return [];
    const all = storage.getMaintenanceHistory();
    return all
      .filter(h => {
        const matchVehicle = (h.vehicleId || h.bikeId) === vehicleId;
        const recordOwner = h.ownerId || h.userId || 'user_demo_rajarshee';
        const matchUser = !ownerId || recordOwner === ownerId || recordOwner === 'user_demo_rajarshee';
        return matchVehicle && matchUser;
      })
      .map(h => createServiceHistory(h));
  }

  /**
   * Step 12: Delete a service history record by ID
   * @param {string} id
   * @returns {boolean}
   */
  deleteServiceRecord(id) {
    const all = storage.getMaintenanceHistory();
    const filtered = all.filter(h => h.id !== id);
    storage.saveMaintenanceHistory(filtered);

    if (firebaseService.isReady()) {
      (async () => {
        try {
          const { deleteDoc } = firebaseService.getFirestoreModule();
          const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.SERVICE_HISTORY, id);
          await deleteDoc(docRef);
        } catch (err) {
          console.warn(`[ServiceHistoryService] Firestore delete failed for service ${id}:`, err.message);
        }
      })();
    }

    return true;
  }
}

export const serviceHistoryService = new ServiceHistoryService();
