/**
 * RideLog Canonical Data Models & Entity Schemas
 * Standardized structures designed for Firebase Firestore & Clerk Authentication
 */

/**
 * USER Entity
 * @typedef {Object} User
 * @property {string} id - Internal unique user ID
 * @property {string} clerkUserId - Clerk Authentication User ID (e.g., user_2N...)
 * @property {string} name - Rider full name
 * @property {string} email - Rider email address
 * @property {string} createdAt - ISO 8601 creation timestamp
 */
export function createUser(data = {}) {
  const now = new Date().toISOString();
  return {
    id: data.id || `user_${Date.now()}`,
    clerkUserId: data.clerkUserId || (data.id ? `clerk_${data.id}` : `clerk_user_${Date.now()}`),
    name: data.name || 'Rider',
    email: data.email || '',
    createdAt: data.createdAt || now
  };
}

/**
 * VEHICLE Entity
 * @typedef {Object} Vehicle
 * @property {string} id - Unique vehicle identifier
 * @property {string} userId - Owner's user identifier (USER.id)
 * @property {string} manufacturer - Vehicle manufacturer (e.g. Royal Enfield)
 * @property {string} model - Vehicle model (e.g. Hunter 350)
 * @property {string} [variant] - Specific variant / trim (e.g. Dapper Ash)
 * @property {number} year - Manufacturing year (e.g. 2023)
 * @property {string} registrationNumber - License / registration plate number
 * @property {number} currentMileage - Current vehicle odometer in kilometers
 * @property {string} imageUrl - Cover / avatar image URL
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} updatedAt - ISO 8601 timestamp
 * 
 * Also provides compatibility getters/aliases for existing UI components:
 * name, currentOdo, image
 */
export function createVehicle(data = {}) {
  const now = new Date().toISOString();
  const currentMileage = Number(data.currentMileage ?? data.currentOdo ?? 0);
  const manufacturer = data.manufacturer || 'Royal Enfield';
  const model = data.model || data.name || 'Hunter 350';
  const name = data.name || `${manufacturer} ${model}`.trim();
  const imageUrl = data.imageUrl || data.image || (model.toLowerCase().includes('duke') ? 'assets/duke-390.jpg' : 'assets/hunter-350.jpg');

  return {
    id: data.id || `veh_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    userId: data.userId || '',
    manufacturer,
    model,
    variant: data.variant || '',
    year: Number(data.year) || new Date().getFullYear(),
    registrationNumber: data.registrationNumber || '',
    currentMileage,
    imageUrl,
    image: imageUrl,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,

    // Backward compatibility aliases for existing UI renderer
    get name() { return name; },
    get currentOdo() { return this.currentMileage; },
    set currentOdo(val) { this.currentMileage = Number(val); }
  };
}

/**
 * MAINTENANCE_RECORD Entity
 * @typedef {Object} MaintenanceRecord
 * @property {string} id - Unique maintenance record ID
 * @property {string} vehicleId - Target vehicle reference (VEHICLE.id)
 * @property {string} userId - Owner reference ID (USER.id)
 * @property {string} serviceType - Service task category (e.g. "Engine Oil", "Chain Service")
 * @property {number} mileage - Recorded mileage at service completion
 * @property {string} serviceDate - Service completion date (YYYY-MM-DD)
 * @property {string} [notes] - Additional technician / rider notes
 * @property {string} createdAt - ISO 8601 creation timestamp
 */
export function createMaintenanceRecord(data = {}) {
  const now = new Date().toISOString();
  const vehicleId = data.vehicleId || data.bikeId || '';
  const mileage = Number(data.mileage ?? data.completedKm ?? data.lastServiceKm ?? 0);
  const serviceType = data.serviceType || data.type || 'General Service';

  return {
    id: data.id || `maint_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    vehicleId,
    userId: data.userId || '',
    serviceType,
    mileage,
    serviceDate: data.serviceDate || data.date || now.split('T')[0],
    notes: data.notes || '',
    createdAt: data.createdAt || now,

    // Backward compatibility aliases for existing maintenance engine
    get bikeId() { return vehicleId; },
    set bikeId(val) { this.vehicleId = val; },
    get type() { return serviceType; },
    set type(val) { this.serviceType = val; },
    get completedKm() { return mileage; },
    set completedKm(val) { this.mileage = Number(val); },
    get date() { return this.serviceDate; },
    set date(val) { this.serviceDate = val; }
  };
}

/**
 * MAINTENANCE_RULE Entity
 * Ready for future OEM intervals integration (no fake rules populated yet)
 * @typedef {Object} MaintenanceRule
 * @property {string} id - Unique rule ID
 * @property {string} manufacturer - Vehicle manufacturer (e.g. "Royal Enfield")
 * @property {string} model - Target model
 * @property {number} year - Model year
 * @property {string} serviceType - Service task type
 * @property {number} intervalKm - Interval in kilometers
 * @property {number} intervalMonths - Interval in months
 * @property {string} source - Source of rule (e.g. "OEM Manual", "Workshop Spec")
 */
export function createMaintenanceRule(data = {}) {
  return {
    id: data.id || `rule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    manufacturer: data.manufacturer || '',
    model: data.model || '',
    year: Number(data.year) || 0,
    serviceType: data.serviceType || '',
    intervalKm: Number(data.intervalKm) || 0,
    intervalMonths: Number(data.intervalMonths) || 0,
    source: data.source || 'OEM Manual'
  };
}
