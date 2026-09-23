/**
 * Maintenance Service Layer
 * Multi-user maintenance schedule & history abstraction layer ready for Firebase Firestore.
 * Handles service schedules, completion history, and OEM maintenance rules.
 */

import { createMaintenanceRecord } from '../models/types.js';
import { authService } from './auth.js';
import { storage } from '../storage.js';

class MaintenanceService {
  /**
   * Get active maintenance schedule items for a specific vehicle and user
   * @param {string} vehicleId
   * @param {string} [userId]
   * @returns {Array<Object>}
   */
  getMaintenance(vehicleId, userId = authService.getUserId()) {
    if (!vehicleId) return [];
    const all = storage.getMaintenance();
    return all.filter(m => {
      const matchVehicle = (m.bikeId || m.vehicleId) === vehicleId;
      const matchUser = !userId || !m.userId || m.userId === userId || m.userId === 'user_demo_rajarshee';
      return matchVehicle && matchUser;
    });
  }

  /**
   * Get all maintenance schedule items for a user
   * @param {string} [userId]
   * @returns {Array<Object>}
   */
  getAllMaintenance(userId = authService.getUserId()) {
    const all = storage.getMaintenance();
    if (!userId) return all;
    return all.filter(m => (m.userId || 'user_demo_rajarshee') === userId);
  }

  /**
   * Get completed service history logs for a specific vehicle and user
   * @param {string} vehicleId
   * @param {string} [userId]
   * @returns {Array<MaintenanceRecord>}
   */
  getMaintenanceHistory(vehicleId, userId = authService.getUserId()) {
    if (!vehicleId) return [];
    const all = storage.getMaintenanceHistory();
    const filtered = all.filter(h => {
      const matchVehicle = (h.bikeId || h.vehicleId) === vehicleId;
      const matchUser = !userId || !h.userId || h.userId === userId || h.userId === 'user_demo_rajarshee';
      return matchVehicle && matchUser;
    });
    return filtered.map(h => createMaintenanceRecord(h));
  }

  /**
   * Add a maintenance schedule item
   * @param {Object} itemData
   * @param {string} [userId]
   * @returns {Object}
   */
  addMaintenanceScheduleItem(itemData, userId = authService.getUserId()) {
    const item = {
      ...itemData,
      id: itemData.id || `maint_sch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      userId: userId || 'user_demo_rajarshee',
      vehicleId: itemData.vehicleId || itemData.bikeId,
      bikeId: itemData.vehicleId || itemData.bikeId
    };

    const all = storage.getMaintenance();
    all.push(item);
    storage.saveMaintenance(all);
    return item;
  }

  /**
   * Update an existing maintenance schedule item
   * @param {string} id
   * @param {Object} updates
   * @returns {boolean}
   */
  updateMaintenanceScheduleItem(id, updates) {
    const all = storage.getMaintenance();
    const idx = all.findIndex(m => m.id === id);
    if (idx === -1) return false;

    all[idx] = { ...all[idx], ...updates };
    storage.saveMaintenance(all);
    return true;
  }

  /**
   * Delete a maintenance schedule item
   * @param {string} id
   * @returns {boolean}
   */
  deleteMaintenanceScheduleItem(id) {
    const all = storage.getMaintenance();
    const filtered = all.filter(m => m.id !== id);
    storage.saveMaintenance(filtered);
    return true;
  }

  /**
   * Add a completed maintenance record into history (MAINTENANCE_RECORD)
   * @param {Object} recordData
   * @param {string} [userId]
   * @returns {MaintenanceRecord}
   */
  addMaintenanceRecord(recordData, userId = authService.getUserId()) {
    const record = createMaintenanceRecord({
      ...recordData,
      userId: userId || 'user_demo_rajarshee'
    });

    const all = storage.getMaintenanceHistory();
    all.unshift(record);
    storage.saveMaintenanceHistory(all);
    return record;
  }

  /**
   * Complete a service task: saves history record and resets schedule
   * @param {Object} params
   * @returns {MaintenanceRecord}
   */
  completeService({ scheduleItemId, vehicleId, serviceType, completedKm, cost, notes, date, nextServiceKm }) {
    const userId = authService.getUserId() || 'user_demo_rajarshee';

    // 1. Log to completed maintenance history
    const record = this.addMaintenanceRecord({
      vehicleId,
      userId,
      serviceType,
      mileage: completedKm,
      serviceDate: date || new Date().toISOString().split('T')[0],
      notes: notes || `Service logged at ${completedKm} km. Cost: ₹${cost || 0}`
    }, userId);

    // 2. If connected to a schedule item, update lastServiceKm and calculate next
    if (scheduleItemId) {
      const all = storage.getMaintenance();
      const item = all.find(m => m.id === scheduleItemId);
      if (item) {
        item.lastServiceKm = Number(completedKm);
        item.lastServiceDate = date || new Date().toISOString().split('T')[0];
        if (nextServiceKm) {
          item.nextServiceKm = Number(nextServiceKm);
        } else if (item.intervalKm) {
          item.nextServiceKm = Number(completedKm) + Number(item.intervalKm);
        }
        storage.saveMaintenance(all);
      }
    }

    return record;
  }

  /**
   * OEM Maintenance Rules query (ready for official Royal Enfield & OEM intervals)
   * Does not populate fake rules now as requested.
   * @param {string} manufacturer
   * @param {string} model
   * @param {number} year
   * @returns {Array}
   */
  getMaintenanceRules(manufacturer, model, year) {
    // Ready for future Firestore query: collection('maintenance_rules').where(...)
    return [];
  }
}

export const maintenanceService = new MaintenanceService();
