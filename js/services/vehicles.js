/**
 * Vehicles Service Layer
 * Multi-user vehicle data abstraction layer ready for Firebase Firestore.
 * Isolates vehicle CRUD operations, active ride management, and data formatting.
 */

import { createVehicle } from '../models/types.js';
import { authService } from './auth.js';
import { storage } from '../storage.js';

class VehicleService {
  /**
   * Get all vehicles belonging to a specific user (or active user)
   * @param {string} [userId]
   * @returns {Array<Vehicle>}
   */
  getVehicles(userId = authService.getUserId()) {
    if (!userId) return [];
    const all = storage.getMotorcycles();
    const userVehicles = all.filter(v => (v.userId || 'user_demo_rajarshee') === userId);
    return userVehicles.map(v => createVehicle(v));
  }

  /**
   * Get single vehicle by ID
   * @param {string} id
   * @returns {Vehicle|null}
   */
  getVehicleById(id) {
    const all = storage.getMotorcycles();
    const found = all.find(v => v.id === id);
    return found ? createVehicle(found) : null;
  }

  /**
   * Get the active vehicle for the user
   * @param {string} [userId]
   * @returns {Vehicle|null}
   */
  getActiveVehicle(userId = authService.getUserId()) {
    const vehicles = this.getVehicles(userId);
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
   * Set the active vehicle ID
   * @param {string} id
   * @returns {boolean}
   */
  setActiveVehicleId(id) {
    const success = storage.setActiveBikeId(id);
    return Boolean(success);
  }

  /**
   * Add a new vehicle for a user
   * @param {Object} vehicleData
   * @param {string} [userId]
   * @returns {Vehicle}
   */
  addVehicle(vehicleData, userId = authService.getUserId()) {
    const vehicle = createVehicle({
      ...vehicleData,
      userId: userId || 'user_demo_rajarshee'
    });

    const all = storage.getMotorcycles();
    all.push(vehicle);
    storage.saveMotorcycles(all);

    // If this is user's only vehicle, set it as active
    const userVehicles = this.getVehicles(userId);
    if (userVehicles.length === 1) {
      storage.setActiveBikeId(vehicle.id);
    }

    return vehicle;
  }

  /**
   * Update an existing vehicle
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
    return true;
  }

  /**
   * Delete a vehicle by ID
   * @param {string} id
   * @param {string} [userId]
   * @returns {boolean}
   */
  deleteVehicle(id, userId = authService.getUserId()) {
    const all = storage.getMotorcycles();
    const filtered = all.filter(v => v.id !== id);
    storage.saveMotorcycles(filtered);

    // If deleted vehicle was active, select next available for this user
    if (storage.getActiveBikeId() === id) {
      const remaining = this.getVehicles(userId);
      if (remaining.length > 0) {
        storage.setActiveBikeId(remaining[0].id);
      } else {
        localStorage.removeItem('ridelog_active_bike_id');
      }
    }
    return true;
  }

  /**
   * Get the display image URL for a vehicle.
   * Prioritizes user-uploaded images, falls back to appropriate brand assets.
   * @param {Object} vehicle
   * @returns {string}
   */
  getVehicleImage(vehicle) {
    if (!vehicle) return 'assets/hunter-350.jpg';
    if (vehicle.imageUrl && vehicle.imageUrl.trim() !== '') return vehicle.imageUrl;
    if (vehicle.image && vehicle.image.trim() !== '') return vehicle.image;
    const name = (vehicle.model || vehicle.name || '').toLowerCase();
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
    const img = vehicle.imageUrl || vehicle.image || '';
    return Boolean(img && !img.startsWith('assets/'));
  }
}

export const vehicleService = new VehicleService();
