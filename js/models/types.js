/**
 * RideLog Canonical Data Models & Entity Schemas
 * Standardized structures designed for Firebase Firestore & Clerk Authentication
 *
 * Distinguishes between:
 * 1. Global Catalogue Data (js/models/catalogue.js)
 * 2. User-Owned Data (users, vehicles, serviceHistory, rides)
 */

/**
 * Step 5: USER Entity
 * Document path: users/{clerkUserId}
 *
 * @typedef {Object} User
 * @property {string} clerkUserId - Clerk Authentication User ID (e.g., user_2N...)
 * @property {string} displayName - Rider full name or display name
 * @property {string} email - Rider primary email address
 * @property {string} createdAt - ISO 8601 creation timestamp
 * @property {string} updatedAt - ISO 8601 update timestamp
 */
export function createUser(data = {}) {
  const now = new Date().toISOString();
  const clerkUserId = data.clerkUserId || data.id || '';
  const displayName = data.displayName || data.name || 'Rider';
  const email = data.email || '';

  return {
    clerkUserId,
    displayName,
    email,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,

    // Backward-compatibility getters/setters
    get id() { return this.clerkUserId; },
    get name() { return this.displayName; },
    set name(val) { this.displayName = val; }
  };
}

/**
 * Step 6: VEHICLE Entity
 * Document path: vehicles/{vehicleId}
 * Multi-motorcycle support per user.
 *
 * @typedef {Object} Vehicle
 * @property {string} id - Unique vehicle identifier
 * @property {string} ownerId - Owner's Clerk User ID (clerkUserId)
 * @property {string} brandId - Motorcycle manufacturer ID (e.g. 'royal-enfield', 'honda', 'jawa')
 * @property {string} modelId - Model identifier (e.g. 'hunter-350', 'cb350')
 * @property {string} [variantId] - Variant / generation ID
 * @property {number} modelYear - Manufacturing model year (e.g. 2023)
 * @property {string} nickname - Rider's nickname for the bike
 * @property {string} registrationNumber - License / registration plate
 * @property {number} currentOdometer - Current odometer reading in km
 * @property {string} purchaseDate - Purchase date (YYYY-MM-DD)
 * @property {string} image - Cover image URL or base64 data
 * @property {boolean} isActive - Whether bike is currently active in session
 * @property {string} createdAt - ISO 8601 creation timestamp
 * @property {string} updatedAt - ISO 8601 update timestamp
 */
export function createVehicle(data = {}) {
  const now = new Date().toISOString();
  const currentOdometer = Number(data.currentOdometer ?? data.currentMileage ?? data.currentOdo ?? 0);
  const brandId = data.brandId || data.manufacturer || 'royal-enfield';
  const modelId = data.modelId || data.model || 'hunter-350';
  const nickname = data.nickname || data.name || (data.model ? `${data.manufacturer || ''} ${data.model}`.trim() : 'Hunter 350');
  const image = data.image || data.imageUrl || (nickname.toLowerCase().includes('duke') ? 'assets/duke-390.jpg' : 'assets/hunter-350.jpg');
  const modelYear = Number(data.modelYear || data.year) || new Date().getFullYear();
  const ownerId = data.ownerId || data.userId || '';

  return {
    id: data.id || `veh_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    ownerId,
    bikeModelId: data.bikeModelId || (data.brandId && data.modelId && data.modelYear ? `${data.brandId}-${data.modelId}-${data.modelYear}`.toLowerCase().replace(/[^a-z0-9]+/g, '-') : null),
    brandId,
    modelId,
    variantId: data.variantId || data.variant || '',
    modelYear,
    nickname,
    registrationNumber: data.registrationNumber || '',
    currentOdometer,
    purchaseDate: data.purchaseDate || '',
    image,
    isActive: Boolean(data.isActive ?? true),
    specs: data.specs || null,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,

    // Backward compatibility aliases for existing UI renderer & local cache
    get userId() { return this.ownerId; },
    set userId(val) { this.ownerId = val; },
    get name() { return this.nickname; },
    set name(val) { this.nickname = val; },
    get currentMileage() { return this.currentOdometer; },
    set currentMileage(val) { this.currentOdometer = Number(val); },
    get currentOdo() { return this.currentOdometer; },
    set currentOdo(val) { this.currentOdometer = Number(val); },
    get imageUrl() { return this.image; },
    set imageUrl(val) { this.image = val; },
    get year() { return this.modelYear; },
    set year(val) { this.modelYear = Number(val); },
    get manufacturer() { return this.brandId; },
    set manufacturer(val) { this.brandId = val; },
    get model() { return this.modelId; },
    set model(val) { this.modelId = val; }
  };
}

/**
 * Step 12: SERVICE_HISTORY Entity
 * Document path: serviceHistory/{serviceId}
 *
 * @typedef {Object} ServiceHistory
 * @property {string} id - Unique service record ID
 * @property {string} ownerId - Owner's Clerk User ID
 * @property {string} vehicleId - Target vehicle ID
 * @property {string} serviceType - Category of service
 * @property {string} date - Service date (YYYY-MM-DD)
 * @property {number} odometer - Recorded vehicle odometer
 * @property {string} workshop - Workshop / service center name
 * @property {number} cost - Total service cost
 * @property {string} notes - Technician / rider notes
 * @property {Array<string>} parts - Replaced parts list
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} updatedAt - ISO 8601 timestamp
 */
export function createServiceHistory(data = {}) {
  const now = new Date().toISOString();
  const vehicleId = data.vehicleId || data.bikeId || '';
  const odometer = Number(data.odometer ?? data.mileage ?? data.completedKm ?? data.lastServiceKm ?? 0);
  const serviceType = data.serviceType || data.type || 'General Service';
  const ownerId = data.ownerId || data.userId || '';

  return {
    id: data.id || `srv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    ownerId,
    vehicleId,
    serviceType,
    date: data.date || data.serviceDate || now.split('T')[0],
    odometer,
    workshop: data.workshop || '',
    cost: Number(data.cost || 0),
    notes: data.notes || '',
    parts: Array.isArray(data.parts) ? data.parts : [],
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,

    // Backward compatibility aliases for existing UI
    get userId() { return this.ownerId; },
    set userId(val) { this.ownerId = val; },
    get bikeId() { return this.vehicleId; },
    set bikeId(val) { this.vehicleId = val; },
    get type() { return this.serviceType; },
    set type(val) { this.serviceType = val; },
    get mileage() { return this.odometer; },
    set mileage(val) { this.odometer = Number(val); },
    get completedKm() { return this.odometer; },
    set completedKm(val) { this.odometer = Number(val); },
    get serviceDate() { return this.date; },
    set serviceDate(val) { this.date = val; }
  };
}

// Wrapper for legacy imports
export const createMaintenanceRecord = createServiceHistory;

/**
 * Step 13: RIDE Entity
 * Document path: rides/{rideId}
 *
 * @typedef {Object} Ride
 * @property {string} id - Unique ride log ID
 * @property {string} ownerId - Owner's Clerk User ID
 * @property {string} vehicleId - Target vehicle ID
 * @property {string} date - Ride date (YYYY-MM-DD)
 * @property {number} distanceKm - Total trip distance in kilometers
 * @property {string} duration - Ride duration (e.g. "2h 45m")
 * @property {string} startLocation - Starting waypoint / address
 * @property {string} destination - Ending waypoint / address
 * @property {string} notes - Ride notes or trail conditions
 * @property {number} fuelCost - Fuel spend on trip
 * @property {string} createdAt - ISO 8601 timestamp
 * @property {string} updatedAt - ISO 8601 timestamp
 */
export function createRide(data = {}) {
  const now = new Date().toISOString();
  const vehicleId = data.vehicleId || data.bikeId || '';
  const ownerId = data.ownerId || data.userId || '';
  const distanceKm = Number(data.distanceKm ?? data.distance ?? 0);
  const fuelCost = Number(data.fuelCost ?? data.cost ?? 0);

  return {
    id: data.id || `ride_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    ownerId,
    vehicleId,
    date: data.date || now.split('T')[0],
    distanceKm,
    duration: data.duration || '',
    startLocation: data.startLocation || data.from || '',
    destination: data.destination || data.to || '',
    notes: data.notes || '',
    fuelCost,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,

    // Backward compatibility aliases for existing UI
    get userId() { return this.ownerId; },
    set userId(val) { this.ownerId = val; },
    get bikeId() { return this.vehicleId; },
    set bikeId(val) { this.vehicleId = val; },
    get distance() { return this.distanceKm; },
    set distance(val) { this.distanceKm = Number(val); },
    get from() { return this.startLocation; },
    set from(val) { this.startLocation = val; },
    get to() { return this.destination; },
    set to(val) { this.destination = val; },
    get cost() { return this.fuelCost; },
    set cost(val) { this.fuelCost = Number(val); }
  };
}

/**
 * Legacy Maintenance Rule Entity
 */
export function createMaintenanceRule(data = {}) {
  return {
    id: data.id || `rule_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    brandId: data.brandId || data.manufacturer || '',
    modelId: data.modelId || data.model || '',
    year: Number(data.year) || 0,
    serviceType: data.serviceType || '',
    intervalKm: Number(data.intervalKm) || 0,
    intervalMonths: Number(data.intervalMonths) || 0,
    source: data.source || 'OEM Manual'
  };
}
