/**
 * Motorcycle Catalogue Data Models & Schemas
 * Standardized schema definitions for the Global Motorcycle Catalogue.
 *
 * Supported Manufacturers (Phase 1):
 * 1. Royal Enfield
 * 2. Honda
 * 3. Jawa
 *
 * Catalogue Hierarchy:
 * Manufacturer (brandId) -> Model (modelId) -> Variant/Generation (variantId) -> Model Year (modelYear)
 */

/**
 * Phase 1 Supported Indian Market Motorcycle Manufacturers
 */
export const SUPPORTED_MANUFACTURERS = [
  {
    id: 'royal-enfield',
    name: 'Royal Enfield',
    country: 'India',
    established: 1901
  },
  {
    id: 'honda',
    name: 'Honda',
    country: 'India / Japan',
    established: 1948
  },
  {
    id: 'jawa',
    name: 'Jawa',
    country: 'India / Czech',
    established: 1929
  }
];

export const VEHICLE_TYPES = ['motorcycle', 'scooter'];

export const VEHICLE_CATEGORIES = [
  'commuter',
  'naked',
  'classic',
  'cruiser',
  'sport',
  'adventure',
  'touring',
  'scrambler',
  'cafe racer',
  'dual sport',
  'other'
];

/**
 * Step 8: Motorcycle Model Entity Factory
 * Represents a distinct base model line in `motorcycleModels` collection
 * @param {Object} data
 * @returns {Object}
 */
export function createMotorcycleModel(data = {}) {
  const now = new Date().toISOString();
  return {
    brandId: data.brandId || '',
    modelId: data.modelId || '',
    modelName: data.modelName || '',
    vehicleType: VEHICLE_TYPES.includes(data.vehicleType) ? data.vehicleType : 'motorcycle',
    category: VEHICLE_CATEGORIES.includes(data.category) ? data.category : 'other',
    productionStartYear: data.productionStartYear ? Number(data.productionStartYear) : null,
    productionEndYear: data.productionEndYear ? Number(data.productionEndYear) : null,
    market: data.market || 'India',
    source: data.source || null,
    sourceUrl: data.sourceUrl || null,
    verifiedAt: data.verifiedAt || null,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };
}

/**
 * Step 9: Motorcycle Variant / Year Entity Factory
 * Represents a specific trim, engine spec, or model-year in `motorcycleVariants` collection
 * @param {Object} data
 * @returns {Object}
 */
export function createMotorcycleVariant(data = {}) {
  const now = new Date().toISOString();
  return {
    variantId: data.variantId || '',
    modelId: data.modelId || '',
    variantName: data.variantName || '',
    generation: data.generation || null,
    modelYear: data.modelYear ? Number(data.modelYear) : null,
    engineDisplacement: data.engineDisplacement || null, // e.g. "349 cc"
    engineType: data.engineType || null,                 // e.g. "Single cylinder, 4 stroke, air-oil cooled"
    cooling: data.cooling || null,                       // e.g. "Air-Oil", "Liquid", "Air"
    fuelSystem: data.fuelSystem || null,                 // e.g. "Electronic Fuel Injection"
    transmission: data.transmission || null,             // e.g. "Manual"
    gearbox: data.gearbox || null,                       // e.g. "5-speed"
    maxPower: data.maxPower || null,                     // e.g. "20.2 bhp @ 6100 rpm"
    maxTorque: data.maxTorque || null,                   // e.g. "27 Nm @ 4000 rpm"
    kerbWeight: data.kerbWeight ? Number(data.kerbWeight) : null, // kg
    fuelCapacity: data.fuelCapacity ? Number(data.fuelCapacity) : null, // litres
    seatHeight: data.seatHeight ? Number(data.seatHeight) : null, // mm
    wheelSize: data.wheelSize || null,                   // e.g. "17 inch"
    frontTyre: data.frontTyre || null,                   // e.g. "110/70 - 17"
    rearTyre: data.rearTyre || null,                     // e.g. "140/70 - 17"
    frontBrake: data.frontBrake || null,                 // e.g. "300mm Disc"
    rearBrake: data.rearBrake || null,                   // e.g. "270mm Disc"
    abs: data.abs || null,                               // e.g. "Dual Channel", "Single Channel"
    emissionStandard: data.emissionStandard || null,     // e.g. "BS6 Phase 2", "BS6", "BS4"
    source: data.source || null,
    sourceUrl: data.sourceUrl || null,
    verifiedAt: data.verifiedAt || null,
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };
}

/**
 * Step 14: OEM Maintenance Schedule Architecture
 * Represents recommended service intervals in `maintenanceSchedules` collection
 * (Intervals will be populated from verified manufacturer manuals in the next task)
 * @param {Object} data
 * @returns {Object}
 */
export function createMaintenanceSchedule(data = {}) {
  const now = new Date().toISOString();
  return {
    id: data.id || '',
    brandId: data.brandId || '',
    modelId: data.modelId || '',
    variantId: data.variantId || null,
    serviceType: data.serviceType || '',
    intervalKm: data.intervalKm ? Number(data.intervalKm) : null,
    intervalMonths: data.intervalMonths ? Number(data.intervalMonths) : null,
    source: data.source || 'OEM Service Manual',
    sourceUrl: data.sourceUrl || null,
    verifiedAt: data.verifiedAt || null,
    notes: data.notes || '',
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now
  };
}
