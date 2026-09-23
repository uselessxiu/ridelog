/**
 * Service History & Rides Service Layer
 * Multi-user trip log & odometer tracker abstraction layer ready for Firebase Firestore.
 */

import { authService } from './auth.js';
import { vehicleService } from './vehicles.js';
import { storage } from '../storage.js';

class ServiceHistoryService {
  /**
   * Get rides for a specific vehicle and user
   * @param {string} vehicleId
   * @param {string} [userId]
   * @returns {Array<Object>}
   */
  getRides(vehicleId, userId = authService.getUserId()) {
    if (!vehicleId) return [];
    const all = storage.getRides();
    return all.filter(r => {
      const matchVehicle = (r.bikeId || r.vehicleId) === vehicleId;
      const matchUser = !userId || !r.userId || r.userId === userId || r.userId === 'user_demo_rajarshee';
      return matchVehicle && matchUser;
    });
  }

  /**
   * Get all rides for a user across all vehicles
   * @param {string} [userId]
   * @returns {Array<Object>}
   */
  getAllRides(userId = authService.getUserId()) {
    const all = storage.getRides();
    if (!userId) return all;
    return all.filter(r => !r.userId || r.userId === userId || r.userId === 'user_demo_rajarshee');
  }

  /**
   * Get ride by ID
   * @param {string} id
   * @returns {Object|null}
   */
  getRideById(id) {
    const all = storage.getRides();
    return all.find(r => r.id === id) || null;
  }

  /**
   * Add a new ride log
   * @param {Object} rideData
   * @param {string} [userId]
   * @returns {Object}
   */
  addRide(rideData, userId = authService.getUserId()) {
    const effectiveUserId = userId || authService.getUserId() || 'user_demo_rajarshee';
    const vehicleId = rideData.vehicleId || rideData.bikeId;

    const ride = {
      ...rideData,
      id: rideData.id || `ride_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      userId: effectiveUserId,
      vehicleId,
      bikeId: vehicleId
    };

    const all = storage.getRides();
    all.unshift(ride);
    storage.saveRides(all);

    // Sync vehicle's current odometer if this ride's endKm is higher
    if (vehicleId && ride.endKm) {
      const bike = vehicleService.getVehicleById(vehicleId);
      if (bike && Number(ride.endKm) > (Number(bike.currentMileage) || 0)) {
        vehicleService.updateVehicle(vehicleId, { currentMileage: Number(ride.endKm) });
      }
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

    const updated = { ...all[idx], ...updates };
    all[idx] = updated;
    storage.saveRides(all);

    const vehicleId = updated.vehicleId || updated.bikeId;
    if (vehicleId && updated.endKm) {
      const bike = vehicleService.getVehicleById(vehicleId);
      if (bike && Number(updated.endKm) > (Number(bike.currentMileage) || 0)) {
        vehicleService.updateVehicle(vehicleId, { currentMileage: Number(updated.endKm) });
      }
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
    return true;
  }
}

export const serviceHistoryService = new ServiceHistoryService();
