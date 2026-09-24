/**
 * AI Motorcycle Identification & Confirmation Service Layer (Frontend)
 * Communicates with the secure backend server:
 * - POST /api/bikes/identify
 * - POST /api/user/bikes
 *
 * Keeps API keys, Gemini credentials, and Clerk secret keys server-side only.
 */

import { authService } from './auth.js';
import { vehicleService } from './vehicles.js';
import { showToast } from '../utils.js';

class AiBikeService {
  constructor() {
    this._isIdentifying = false;
    this._lastIdentifiedModel = null;
  }

  /**
   * Check if an identification request is currently in progress
   * @returns {boolean}
   */
  isLoading() {
    return this._isIdentifying;
  }

  /**
   * Return the last identified bike model from AI / Master Catalogue
   * @returns {Object|null}
   */
  getLastIdentified() {
    return this._lastIdentifiedModel;
  }

  /**
   * Send natural language query to backend AI identification service
   * @param {string} query - e.g. "Royal Enfield Hunter 350", "Honda CB350"
   * @returns {Promise<Object>}
   */
  async identifyBike(query) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new Error('Please enter a motorcycle name or model');
    }

    this._isIdentifying = true;

    try {
      const res = await fetch('/api/bikes/identify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: query.trim() })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to identify motorcycle');
      }

      this._lastIdentifiedModel = data.bikeModel;
      return {
        bikeModel: data.bikeModel,
        isExistingCatalogueItem: Boolean(data.isExistingCatalogueItem),
        message: data.message || 'Motorcycle identified'
      };
    } catch (err) {
      console.warn('[AiBikeService] Identification error:', err.message);
      throw err;
    } finally {
      this._isIdentifying = false;
    }
  }

  /**
   * Confirm identified motorcycle and associate it with user's garage
   * @param {Object} details
   * @param {string} details.bikeModelId - e.g. "royal-enfield-hunter-350-2025"
   * @param {string} [details.nickname]
   * @param {string} [details.registrationNumber]
   * @param {number} [details.currentOdometer]
   * @param {string} [details.purchaseDate]
   * @param {string} [details.notes]
   * @returns {Promise<Object>} Created vehicle entity
   */
  async confirmAndAddUserBike(details) {
    if (!details || !details.bikeModelId) {
      throw new Error('bikeModelId is required to confirm motorcycle');
    }

    const token = await authService.getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const bikeModel = this._lastIdentifiedModel || {};
    const brand = bikeModel.brand || 'Motorcycle';
    const model = bikeModel.model || 'Standard';
    const year = bikeModel.year || new Date().getFullYear();
    const nickname = details.nickname || `${brand} ${model}`;
    const odo = Number(details.currentOdometer) || 0;
    const reg = details.registrationNumber || '';
    const purchased = details.purchaseDate || '';

    let userBikeRecord = null;

    try {
      // 1. Privileged server-side creation
      const res = await fetch('/api/user/bikes', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          bikeModelId: details.bikeModelId,
          nickname,
          registrationNumber: reg,
          currentOdometer: odo,
          purchaseDate: purchased,
          notes: details.notes || ''
        })
      });

      if (res.ok) {
        const result = await res.json();
        userBikeRecord = result.userBike;
      } else if (res.status === 401) {
        console.warn('[AiBikeService] Backend rejected unauthenticated token; proceeding in local mode');
      }
    } catch (err) {
      console.warn('[AiBikeService] Could not reach backend /api/user/bikes; falling back to local storage:', err.message);
    }

    // 2. Add to frontend vehicleService & localStorage (Zero-build client state)
    const defaultImg = model.toLowerCase().includes('duke')
      ? 'assets/duke-390.jpg'
      : (model.toLowerCase().includes('cb350') ? 'assets/hunter-350.jpg' : 'assets/hunter-350.jpg');

    const localVehicle = vehicleService.addVehicle({
      id: userBikeRecord?.id || `bike_${Date.now()}`,
      bikeModelId: details.bikeModelId,
      manufacturer: brand,
      model: model,
      variant: bikeModel.variant || '',
      year: year,
      name: nickname,
      nickname: nickname,
      registrationNumber: reg,
      currentMileage: odo,
      currentOdo: odo,
      purchaseDate: purchased,
      engineCapacity: bikeModel.engine?.displacement || (model.includes('350') ? '349 cc' : '350 cc'),
      imageUrl: defaultImg,
      specs: bikeModel.specifications || null
    });

    vehicleService.setActiveVehicleId(localVehicle.id);
    return localVehicle;
  }
}

export const aiBikeService = new AiBikeService();
