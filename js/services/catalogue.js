/**
 * Motorcycle Catalogue Service Layer
 * Repository abstraction for the Global Motorcycle Catalogue.
 * Handles manufacturer specifications, model hierarchies, variant details,
 * and OEM maintenance schedules.
 *
 * All catalogue queries are encapsulated in this service; the UI never executes
 * direct Firestore queries.
 */

import {
  SUPPORTED_MANUFACTURERS,
  createMotorcycleModel,
  createMotorcycleVariant,
  createMaintenanceSchedule
} from '../models/catalogue.js';
import { firebaseService } from './firebase.js';
import { FIRESTORE_COLLECTIONS } from '../config.js';

class CatalogueService {
  constructor() {
    this._localModels = new Map();
    this._localVariants = new Map();
    this._localSchedules = new Map();
  }

  /**
   * Return supported motorcycle manufacturers (Phase 1: Royal Enfield, Honda, Jawa)
   * @returns {Array<Object>}
   */
  getManufacturers() {
    return [...SUPPORTED_MANUFACTURERS];
  }

  /**
   * Check if a manufacturer ID is currently supported
   * @param {string} brandId
   * @returns {boolean}
   */
  isManufacturerSupported(brandId) {
    if (!brandId) return false;
    const normalized = brandId.toLowerCase().trim();
    return SUPPORTED_MANUFACTURERS.some(m => m.id === normalized);
  }

  /**
   * Get all motorcycle models for a specific manufacturer
   * @param {string} brandId - e.g. 'royal-enfield', 'honda', 'jawa'
   * @returns {Promise<Array<Object>>}
   */
  async getModelsByManufacturer(brandId) {
    if (!brandId) return [];
    const normalizedBrand = brandId.toLowerCase().trim();

    if (firebaseService.isReady()) {
      try {
        const { getDocs, query, where } = firebaseService.getFirestoreModule();
        const colRef = firebaseService.getCollectionRef(FIRESTORE_COLLECTIONS.MOTORCYCLE_MODELS);
        const q = query(colRef, where('brandId', '==', normalizedBrand));
        const snapshot = await getDocs(q);

        const models = [];
        snapshot.forEach(docSnap => {
          models.push(createMotorcycleModel({ ...docSnap.data(), modelId: docSnap.id }));
        });
        return models;
      } catch (err) {
        console.error(`[CatalogueService] Failed to fetch models for ${brandId} from Firestore:`, err);
      }
    }

    // In-memory fallback
    const local = Array.from(this._localModels.values()).filter(m => m.brandId === normalizedBrand);
    return local.map(m => createMotorcycleModel(m));
  }

  /**
   * Get all variants and generations for a specific model
   * @param {string} modelId
   * @returns {Promise<Array<Object>>}
   */
  async getVariantsByModel(modelId) {
    if (!modelId) return [];

    if (firebaseService.isReady()) {
      try {
        const { getDocs, query, where } = firebaseService.getFirestoreModule();
        const colRef = firebaseService.getCollectionRef(FIRESTORE_COLLECTIONS.MOTORCYCLE_VARIANTS);
        const q = query(colRef, where('modelId', '==', modelId));
        const snapshot = await getDocs(q);

        const variants = [];
        snapshot.forEach(docSnap => {
          variants.push(createMotorcycleVariant({ ...docSnap.data(), variantId: docSnap.id }));
        });
        return variants;
      } catch (err) {
        console.error(`[CatalogueService] Failed to fetch variants for model ${modelId} from Firestore:`, err);
      }
    }

    const local = Array.from(this._localVariants.values()).filter(v => v.modelId === modelId);
    return local.map(v => createMotorcycleVariant(v));
  }

  /**
   * Get all available model years for a specific motorcycle model
   * @param {string} modelId
   * @returns {Promise<Array<number>>}
   */
  async getYearsByModel(modelId) {
    const variants = await this.getVariantsByModel(modelId);
    const yearsSet = new Set();
    variants.forEach(v => {
      if (v.modelYear && typeof v.modelYear === 'number') {
        yearsSet.add(v.modelYear);
      }
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }

  /**
   * Get full motorcycle details (model + variants) by model ID
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async getMotorcycleById(id) {
    if (!id) return null;

    if (firebaseService.isReady()) {
      try {
        const { getDoc } = firebaseService.getFirestoreModule();
        const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.MOTORCYCLE_MODELS, id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const model = createMotorcycleModel({ ...docSnap.data(), modelId: docSnap.id });
          const variants = await this.getVariantsByModel(id);
          return { model, variants };
        }
      } catch (err) {
        console.error(`[CatalogueService] Failed to fetch motorcycle ${id}:`, err);
      }
    }

    if (this._localModels.has(id)) {
      const model = createMotorcycleModel(this._localModels.get(id));
      const variants = await this.getVariantsByModel(id);
      return { model, variants };
    }

    return null;
  }

  /**
   * Search motorcycle catalogue by query string (searches modelName and brandId)
   * @param {string} queryStr
   * @returns {Promise<Array<Object>>}
   */
  async searchMotorcycles(queryStr) {
    if (!queryStr || queryStr.trim() === '') return [];
    const term = queryStr.toLowerCase().trim();

    // Catalogue search uses in-memory or Firestore search
    let pool = [];
    if (firebaseService.isReady()) {
      try {
        const { getDocs } = firebaseService.getFirestoreModule();
        const colRef = firebaseService.getCollectionRef(FIRESTORE_COLLECTIONS.MOTORCYCLE_MODELS);
        const snapshot = await getDocs(colRef);
        snapshot.forEach(docSnap => {
          pool.push(createMotorcycleModel({ ...docSnap.data(), modelId: docSnap.id }));
        });
      } catch (err) {
        console.error('[CatalogueService] Search query failed in Firestore:', err);
      }
    }

    if (pool.length === 0) {
      pool = Array.from(this._localModels.values()).map(m => createMotorcycleModel(m));
    }

    return pool.filter(m =>
      (m.modelName && m.modelName.toLowerCase().includes(term)) ||
      (m.brandId && m.brandId.toLowerCase().includes(term))
    );
  }

  /**
   * Step 14: Get verified OEM maintenance schedules for a model
   * @param {string} modelId
   * @returns {Promise<Array<Object>>}
   */
  async getMaintenanceSchedulesByModel(modelId) {
    if (!modelId) return [];

    if (firebaseService.isReady()) {
      try {
        const { getDocs, query, where } = firebaseService.getFirestoreModule();
        const colRef = firebaseService.getCollectionRef(FIRESTORE_COLLECTIONS.MAINTENANCE_SCHEDULES);
        const q = query(colRef, where('modelId', '==', modelId));
        const snapshot = await getDocs(q);

        const schedules = [];
        snapshot.forEach(docSnap => {
          schedules.push(createMaintenanceSchedule({ ...docSnap.data(), id: docSnap.id }));
        });
        return schedules;
      } catch (err) {
        console.error(`[CatalogueService] Failed to fetch maintenance schedules for model ${modelId}:`, err);
      }
    }

    const local = Array.from(this._localSchedules.values()).filter(s => s.modelId === modelId);
    return local.map(s => createMaintenanceSchedule(s));
  }

  /**
   * Administrative helper to register a model in Firestore
   * @param {Object} modelData
   * @returns {Promise<boolean>}
   */
  async addModel(modelData) {
    const model = createMotorcycleModel(modelData);
    if (!model.modelId) return false;

    this._localModels.set(model.modelId, model);

    if (firebaseService.isReady()) {
      try {
        const { setDoc } = firebaseService.getFirestoreModule();
        const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.MOTORCYCLE_MODELS, model.modelId);
        await setDoc(docRef, model, { merge: true });
        return true;
      } catch (err) {
        console.error('[CatalogueService] Failed to save model to Firestore:', err);
        return false;
      }
    }
    return true;
  }

  /**
   * Administrative helper to register a variant in Firestore
   * @param {Object} variantData
   * @returns {Promise<boolean>}
   */
  async addVariant(variantData) {
    const variant = createMotorcycleVariant(variantData);
    if (!variant.variantId) return false;

    this._localVariants.set(variant.variantId, variant);

    if (firebaseService.isReady()) {
      try {
        const { setDoc } = firebaseService.getFirestoreModule();
        const docRef = firebaseService.getDocRef(FIRESTORE_COLLECTIONS.MOTORCYCLE_VARIANTS, variant.variantId);
        await setDoc(docRef, variant, { merge: true });
        return true;
      } catch (err) {
        console.error('[CatalogueService] Failed to save variant to Firestore:', err);
        return false;
      }
    }
    return true;
  }
}

export const catalogueService = new CatalogueService();
