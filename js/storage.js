/**
 * LocalStorage Abstraction Layer
 * Provides robust error handling, JSON serialization, safe data migration,
 * and multi-motorcycle support with schema versioning.
 */

import { DEMO_MOTORCYCLES, DEMO_RIDES, DEMO_MAINTENANCE, DEMO_MAINTENANCE_HISTORY } from './demo-data.js';

const STORAGE_KEYS = {
  RIDES: 'ridelog_rides',
  MAINTENANCE: 'ridelog_maintenance',
  MAINTENANCE_HISTORY: 'ridelog_maintenance_history',
  MOTORCYCLES: 'ridelog_motorcycles',
  ACTIVE_BIKE_ID: 'ridelog_active_bike_id',
  SETTINGS: 'ridelog_settings',
  THEME: 'ridelog_theme'
};

const DEFAULT_SETTINGS = {
  bikeName: 'Hunter 350',
  userName: 'Rajarshee',
  userEmail: 'rajarshee@ridelog.io',
  currency: '₹',
  unitDistance: 'km',
  unitFuel: 'L'
};

const DEFAULT_MOTORCYCLE = {
  id: 'bike_hunter_350_default',
  userId: 'user_demo_rajarshee',
  name: 'Hunter 350',
  manufacturer: 'Royal Enfield',
  model: 'Hunter 350',
  year: 2023,
  engineCapacity: '349 cc',
  registrationNumber: 'WB-02-AK-1234',
  currentOdo: 12450,
  purchaseDate: '2023-04-10',
  image: 'assets/hunter-350.jpg'
};

export const storage = {
  // --- Initialization & Data Migration ---
  initAndMigrate() {
    // 0. Auto-seed realistic demo data on fresh session
    const hasInitialized = localStorage.getItem('ridelog_initialized_demo_v2');
    if (!hasInitialized) {
      this.saveMotorcycles(DEMO_MOTORCYCLES);
      this.saveRides(DEMO_RIDES);
      this.saveMaintenance(DEMO_MAINTENANCE);
      this.saveMaintenanceHistory(DEMO_MAINTENANCE_HISTORY);
      this.setActiveBikeId(DEMO_MOTORCYCLES[0].id);
      localStorage.setItem('ridelog_initialized_demo_v2', 'true');
    }

    // 1. Ensure motorcycles exist on initial demo seeding
    if (!hasInitialized) {
      let bikes = this.getMotorcycles();
      if (!bikes || bikes.length === 0) {
        bikes = DEMO_MOTORCYCLES;
        this.saveMotorcycles(bikes);
        this.setActiveBikeId(bikes[0].id);
      }
    }

    const bikes = this.getMotorcycles();
    let bikesUpdated = false;
    bikes.forEach(b => {
      if (!b.image) {
        if (b.name && b.name.toLowerCase().includes('duke')) {
          b.image = 'assets/duke-390.jpg';
        } else {
          b.image = 'assets/hunter-350.jpg';
        }
        bikesUpdated = true;
      }
    });
    if (bikesUpdated) {
      this.saveMotorcycles(bikes);
    }

    const activeId = this.getActiveBikeId();
    if (!activeId || !bikes.some(b => b.id === activeId)) {
      this.setActiveBikeId(bikes[0].id);
    }

    const defaultBikeId = this.getActiveBikeId();

    // 2. Migrate existing rides without bikeId
    const rides = this.getRides();
    let ridesModified = false;
    rides.forEach(ride => {
      if (!ride.bikeId) {
        ride.bikeId = defaultBikeId;
        ridesModified = true;
      }
    });
    if (ridesModified) {
      this.saveRides(rides);
      console.log('Migrated legacy rides to default bikeId:', defaultBikeId);
    }

    // 4. Multi-user migration: stamp all legacy records with userId
    let bikesUserModified = false;
    bikes.forEach(b => {
      if (!b.userId) {
        b.userId = 'user_demo_rajarshee';
        bikesUserModified = true;
      }
    });
    if (bikesUserModified) this.saveMotorcycles(bikes);

    rides.forEach(r => {
      if (!r.userId) {
        r.userId = 'user_demo_rajarshee';
        ridesModified = true;
      }
    });
    if (ridesModified) this.saveRides(rides);

    const maintenance = this.getMaintenance();
    let maintModified = false;
    maintenance.forEach(m => {
      if (!m.userId) {
        m.userId = 'user_demo_rajarshee';
        maintModified = true;
      }
    });
    if (maintModified) this.saveMaintenance(maintenance);

    const history = this.getMaintenanceHistory();
    let historyModified = false;
    history.forEach(h => {
      if (!h.userId) {
        h.userId = 'user_demo_rajarshee';
        historyModified = true;
      }
    });
    if (historyModified) this.saveMaintenanceHistory(history);
  },

  // --- Motorcycles ---
  getMotorcycles() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MOTORCYCLES);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Failed to parse motorcycles from localStorage:', err);
      return [];
    }
  },

  getMotorcyclesByUserId(userId) {
    const bikes = this.getMotorcycles();
    if (!userId) return bikes;
    return bikes.filter(b => (b.userId || 'user_demo_rajarshee') === userId);
  },

  saveMotorcycles(bikes) {
    try {
      localStorage.setItem(STORAGE_KEYS.MOTORCYCLES, JSON.stringify(bikes));
      return true;
    } catch (err) {
      console.error('Failed to save motorcycles:', err);
      return false;
    }
  },

  addMotorcycle(bike) {
    const bikes = this.getMotorcycles();
    bikes.push(bike);
    this.saveMotorcycles(bikes);
    return bike;
  },

  updateMotorcycle(updatedBike) {
    const bikes = this.getMotorcycles();
    const index = bikes.findIndex(b => b.id === updatedBike.id);
    if (index !== -1) {
      bikes[index] = updatedBike;
      this.saveMotorcycles(bikes);
      return true;
    }
    return false;
  },

  deleteMotorcycle(id) {
    let bikes = this.getMotorcycles();
    if (bikes.length <= 1) {
      return false; // Prevent deleting the sole remaining bike
    }
    bikes = bikes.filter(b => b.id !== id);
    this.saveMotorcycles(bikes);

    // If deleting active bike, fallback to the first available
    if (this.getActiveBikeId() === id) {
      this.setActiveBikeId(bikes[0].id);
    }
    return true;
  },

  getActiveBikeId() {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_BIKE_ID) || null;
  },

  setActiveBikeId(id) {
    try {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_BIKE_ID, id);
      const bikes = this.getMotorcycles();
      const activeBike = bikes.find(b => b.id === id);
      if (activeBike) {
        const settings = this.getSettings();
        settings.bikeName = activeBike.name;
        this.saveSettings(settings);
      }
      return true;
    } catch (err) {
      console.error('Failed to set active bike ID:', err);
      return false;
    }
  },

  getActiveBike() {
    const bikes = this.getMotorcycles();
    const activeId = this.getActiveBikeId();
    return bikes.find(b => b.id === activeId) || bikes[0] || DEFAULT_MOTORCYCLE;
  },

  // --- Rides ---
  getRides() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.RIDES);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Failed to parse rides from localStorage:', err);
      return [];
    }
  },

  getRidesByUserId(userId) {
    const rides = this.getRides();
    if (!userId) return rides;
    return rides.filter(r => (r.userId || 'user_demo_rajarshee') === userId);
  },

  getRidesByBike(bikeId) {
    const rides = this.getRides();
    return rides.filter(r => r.bikeId === bikeId);
  },

  saveRides(rides) {
    try {
      localStorage.setItem(STORAGE_KEYS.RIDES, JSON.stringify(rides));
      return true;
    } catch (err) {
      console.error('Failed to save rides to localStorage:', err);
      return false;
    }
  },

  addRide(ride) {
    const rides = this.getRides();
    rides.unshift(ride); // Add to top
    this.saveRides(rides);

    // Sync bike's current odometer if this ride's endKm is higher
    if (ride.bikeId && ride.endKm) {
      const bikes = this.getMotorcycles();
      const bike = bikes.find(b => b.id === ride.bikeId);
      if (bike && Number(ride.endKm) > (Number(bike.currentOdo) || 0)) {
        bike.currentOdo = Number(ride.endKm);
        this.saveMotorcycles(bikes);
      }
    }
    return ride;
  },

  updateRide(updatedRide) {
    const rides = this.getRides();
    const index = rides.findIndex(r => r.id === updatedRide.id);
    if (index !== -1) {
      rides[index] = updatedRide;
      this.saveRides(rides);

      // Sync bike odometer
      if (updatedRide.bikeId && updatedRide.endKm) {
        const bikes = this.getMotorcycles();
        const bike = bikes.find(b => b.id === updatedRide.bikeId);
        if (bike && Number(updatedRide.endKm) > (Number(bike.currentOdo) || 0)) {
          bike.currentOdo = Number(updatedRide.endKm);
          this.saveMotorcycles(bikes);
        }
      }
      return true;
    }
    return false;
  },

  deleteRide(id) {
    const rides = this.getRides();
    const filtered = rides.filter(r => r.id !== id);
    this.saveRides(filtered);
    return true;
  },

  // --- Maintenance ---
  getMaintenance() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MAINTENANCE);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Failed to parse maintenance from localStorage:', err);
      return [];
    }
  },

  getMaintenanceByUserId(userId) {
    const records = this.getMaintenance();
    if (!userId) return records;
    return records.filter(m => (m.userId || 'user_demo_rajarshee') === userId);
  },

  getMaintenanceByBike(bikeId) {
    const records = this.getMaintenance();
    return records.filter(m => m.bikeId === bikeId);
  },

  saveMaintenance(records) {
    try {
      localStorage.setItem(STORAGE_KEYS.MAINTENANCE, JSON.stringify(records));
      return true;
    } catch (err) {
      console.error('Failed to save maintenance to localStorage:', err);
      return false;
    }
  },

  addMaintenance(record) {
    const list = this.getMaintenance();
    list.push(record);
    this.saveMaintenance(list);
    return record;
  },

  updateMaintenance(updatedRecord) {
    const list = this.getMaintenance();
    const index = list.findIndex(m => m.id === updatedRecord.id);
    if (index !== -1) {
      list[index] = updatedRecord;
      this.saveMaintenance(list);
      return true;
    }
    return false;
  },

  deleteMaintenance(id) {
    const list = this.getMaintenance();
    const filtered = list.filter(m => m.id !== id);
    this.saveMaintenance(filtered);
    return true;
  },

  // --- Maintenance History ---
  getMaintenanceHistory() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MAINTENANCE_HISTORY);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Failed to parse maintenance history:', err);
      return [];
    }
  },

  getMaintenanceHistoryByUserId(userId) {
    const history = this.getMaintenanceHistory();
    if (!userId) return history;
    return history.filter(h => (h.userId || 'user_demo_rajarshee') === userId);
  },

  getMaintenanceHistoryByBike(bikeId) {
    const history = this.getMaintenanceHistory();
    return history.filter(h => h.bikeId === bikeId);
  },

  saveMaintenanceHistory(records) {
    try {
      localStorage.setItem(STORAGE_KEYS.MAINTENANCE_HISTORY, JSON.stringify(records));
      return true;
    } catch (err) {
      console.error('Failed to save maintenance history:', err);
      return false;
    }
  },

  addMaintenanceHistory(record) {
    const history = this.getMaintenanceHistory();
    history.unshift(record);
    this.saveMaintenanceHistory(history);
    return record;
  },

  deleteMaintenanceHistory(id) {
    const history = this.getMaintenanceHistory();
    const filtered = history.filter(h => h.id !== id);
    this.saveMaintenanceHistory(filtered);
    return true;
  },

  // --- Settings ---
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch (err) {
      console.error('Failed to parse settings from localStorage:', err);
      return DEFAULT_SETTINGS;
    }
  },

  getUserName() {
    return this.getSettings().userName || 'Rajarshee';
  },

  setUserName(name) {
    const settings = this.getSettings();
    settings.userName = name;
    return this.saveSettings(settings);
  },

  getUserEmail() {
    return this.getSettings().userEmail || 'rajarshee@ridelog.io';
  },

  setUserEmail(email) {
    const settings = this.getSettings();
    settings.userEmail = email;
    return this.saveSettings(settings);
  },

  saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      return true;
    } catch (err) {
      console.error('Failed to save settings:', err);
      return false;
    }
  },

  // --- Theme Management ---
  getTheme() {
    return 'midnight';
  },

  setTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEYS.THEME, theme);
      return true;
    } catch (err) {
      console.error('Failed to save theme:', err);
      return false;
    }
  },

  // --- Clear all data ---
  clearAll() {
    localStorage.removeItem(STORAGE_KEYS.RIDES);
    localStorage.removeItem(STORAGE_KEYS.MAINTENANCE);
    localStorage.removeItem(STORAGE_KEYS.MAINTENANCE_HISTORY);
    localStorage.removeItem(STORAGE_KEYS.MOTORCYCLES);
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_BIKE_ID);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  }
};
