/**
 * Realistic Demo Data for Indian Motorcycle Rider
 * Includes multiple motorcycles (Hunter 350 & Classic 350),
 * map route coordinates, and smart maintenance records.
 */

export const DEMO_MOTORCYCLES = [
  {
    id: "bike_demo_hunter350",
    userId: "user_demo_rajarshee",
    name: "Hunter 350",
    manufacturer: "Royal Enfield",
    model: "Hunter 350 Dapper Ash",
    year: 2023,
    engineCapacity: "349 cc",
    registrationNumber: "WB-02-AK-1234",
    currentOdo: 12450,
    purchaseDate: "2023-04-10",
    image: "assets/hunter-350.jpg"
  },
  {
    id: "bike_demo_duke390",
    userId: "user_demo_rajarshee",
    name: "KTM Duke 390",
    manufacturer: "KTM",
    model: "390 Duke",
    year: 2022,
    engineCapacity: "373 cc",
    registrationNumber: "MH-12-DE-5678",
    currentOdo: 8230,
    purchaseDate: "2022-11-20",
    image: "assets/duke-390.jpg"
  }
];

export const DEMO_RIDES = [
  {
    id: "ride_demo_1",
    userId: "user_demo_rajarshee",
    bikeId: "bike_demo_hunter350",
    name: "Weekend Breakfast Ride",
    route: "Kolkata → Kolaghat",
    date: "2026-09-18",
    startKm: 12280,
    endKm: 12430,
    distance: 150,
    fuel: 4.1,
    fuelPrice: 104.5,
    fuelCost: 428.45,
    mileage: 36.6,
    costPerKm: 2.86,
    notes: "Smooth highway ride on NH16. Quick tea stop at Sher-e-Punjab.",
    startLocation: "Kolkata, West Bengal",
    destination: "Kolaghat, West Bengal",
    startLatitude: 22.5726,
    startLongitude: 88.3639,
    destinationLatitude: 22.4312,
    destinationLongitude: 87.8711,
    routeDistance: 74.5,
    estimatedTime: "~1 hr 45 min"
  },
  {
    id: "ride_demo_2",
    bikeId: "bike_demo_hunter350",
    name: "Pilgrimage Highway Cruise",
    route: "Kolkata → Tarapith",
    date: "2026-09-12",
    startKm: 12066,
    endKm: 12280,
    distance: 214,
    fuel: 5.8,
    fuelPrice: 105.0,
    fuelCost: 609.0,
    mileage: 36.9,
    costPerKm: 2.85,
    notes: "Steady 80-90 km/h cruising. Excellent engine response and fuel efficiency.",
    startLocation: "Kolkata, West Bengal",
    destination: "Tarapith, West Bengal",
    startLatitude: 22.5726,
    startLongitude: 88.3639,
    destinationLatitude: 24.1135,
    destinationLongitude: 87.7989,
    routeDistance: 214.0,
    estimatedTime: "~4 hr 35 min"
  },
  {
    id: "ride_demo_3",
    bikeId: "bike_demo_hunter350",
    name: "Coastal Weekend Getaway",
    route: "Kolkata → Bakkhali",
    date: "2026-09-04",
    startKm: 11818,
    endKm: 12066,
    distance: 248,
    fuel: 7.1,
    fuelPrice: 104.2,
    fuelCost: 739.82,
    mileage: 34.9,
    costPerKm: 2.98,
    notes: "Heavy country traffic near Diamond Harbour, open stretches later.",
    startLocation: "Kolkata, West Bengal",
    destination: "Bakkhali, West Bengal",
    startLatitude: 22.5726,
    startLongitude: 88.3639,
    destinationLatitude: 21.5645,
    destinationLongitude: 88.2589,
    routeDistance: 128.0,
    estimatedTime: "~3 hr 50 min"
  },
  {
    id: "ride_demo_4",
    bikeId: "bike_demo_hunter350",
    name: "City Commute & Errands",
    route: "Salt Lake → Park Street Return",
    date: "2026-08-28",
    startKm: 11776,
    endKm: 11818,
    distance: 42,
    fuel: 1.3,
    fuelPrice: 104.0,
    fuelCost: 135.2,
    mileage: 32.3,
    costPerKm: 3.22,
    notes: "Peak rush hour traffic on EM Bypass. Stop-and-go riding."
  },
  {
    id: "ride_demo_5",
    bikeId: "bike_demo_hunter350",
    name: "Heritage Trail",
    route: "Kolkata → Murshidabad",
    date: "2026-08-15",
    startKm: 11396,
    endKm: 11776,
    distance: 380,
    fuel: 9.8,
    fuelPrice: 105.5,
    fuelCost: 1033.9,
    mileage: 38.8,
    costPerKm: 2.72,
    notes: "Independence day long tour. Fantastic mileage riding calmly around 75 km/h.",
    startLocation: "Kolkata, West Bengal",
    destination: "Murshidabad, West Bengal",
    startLatitude: 22.5726,
    startLongitude: 88.3639,
    destinationLatitude: 24.1755,
    destinationLongitude: 88.2802,
    routeDistance: 218.0,
    estimatedTime: "~5 hr 15 min"
  },
  {
    id: "ride_demo_6",
    bikeId: "bike_demo_classic350",
    name: "Classic Monsoon Cruise",
    route: "Kolkata → Digha Sea Beach",
    date: "2026-09-10",
    startKm: 18180,
    endKm: 18400,
    distance: 220,
    fuel: 6.4,
    fuelPrice: 104.5,
    fuelCost: 668.8,
    mileage: 34.4,
    costPerKm: 3.04,
    notes: "Riding the Classic 350 along the scenic seaside highway.",
    startLocation: "Kolkata, West Bengal",
    destination: "Digha, West Bengal",
    startLatitude: 22.5726,
    startLongitude: 88.3639,
    destinationLatitude: 21.6266,
    destinationLongitude: 87.5074,
    routeDistance: 185.0,
    estimatedTime: "~4 hr 10 min"
  }
];

export const DEMO_MAINTENANCE = [
  {
    id: "maint_demo_1",
    bikeId: "bike_demo_hunter350",
    type: "Engine oil change",
    lastServiceKm: 9650,
    nextServiceKm: 12870, // 12870 - 12450 = 420 km away
    intervalKm: 3220,
    lastServiceDate: "2026-08-12",
    nextServiceDate: "2026-10-15",
    notes: "Motul 7100 10W-50 fully synthetic. Filter replacement included.",
    completedDate: null
  },
  {
    id: "maint_demo_2",
    bikeId: "bike_demo_hunter350",
    type: "Chain lubrication",
    lastServiceKm: 12250,
    nextServiceKm: 13250, // 13250 - 12450 = 800 km away
    intervalKm: 1000,
    lastServiceDate: "2026-09-01",
    nextServiceDate: "2026-10-05",
    notes: "Cleaned with kerosene and lubed with Motul Chain Lube.",
    completedDate: null
  },
  {
    id: "maint_demo_3",
    bikeId: "bike_demo_hunter350",
    type: "Brake inspection",
    lastServiceKm: 8650,
    nextServiceKm: 13650, // 13650 - 12450 = 1,200 km away
    intervalKm: 5000,
    lastServiceDate: "2026-05-20",
    nextServiceDate: "2026-11-20",
    notes: "Check front pad thickness and bleed rear brake fluid.",
    completedDate: null
  },
  {
    id: "maint_demo_4",
    bikeId: "bike_demo_hunter350",
    type: "Tyre pressure check",
    lastServiceKm: 12000,
    nextServiceKm: 13000, // 13000 - 12450 = 550 km away
    intervalKm: 1000,
    lastServiceDate: "2026-09-10",
    nextServiceDate: "2026-10-10",
    notes: "Front: 29 PSI, Rear: 32 PSI cold pressure check.",
    completedDate: null
  },
  {
    id: "maint_demo_5",
    bikeId: "bike_demo_duke390",
    type: "Scheduled Service",
    lastServiceKm: 5000,
    nextServiceKm: 9800, // 9800 - 8230 = 1,570 km away
    intervalKm: 4800,
    lastServiceDate: "2026-05-10",
    nextServiceDate: "2026-11-15",
    notes: "KTM authorized routine service and ECU diagnostics.",
    completedDate: null
  }
];

export const DEMO_MAINTENANCE_HISTORY = [
  {
    id: "hist_demo_1",
    bikeId: "bike_demo_hunter350",
    type: "Routine Service & Oil Change",
    completedKm: 9650, // 12,450 - 9,650 = 2,800 km ago!
    completedDate: "2026-08-12",
    notes: "Full service done at authorized RE service center. Oil and filter changed."
  },
  {
    id: "hist_demo_2",
    bikeId: "bike_demo_hunter350",
    type: "Chain lubrication",
    completedKm: 12250,
    completedDate: "2026-09-01",
    notes: "Cleaned and lubed chain with Motul lube."
  },
  {
    id: "hist_demo_3",
    bikeId: "bike_demo_hunter350",
    type: "Tyre pressure check",
    completedKm: 12000,
    completedDate: "2026-09-10",
    notes: "Checked cold tyre pressures and tread depth."
  }
];

// Ensure all demo records are multi-user tagged
[DEMO_MOTORCYCLES, DEMO_RIDES, DEMO_MAINTENANCE, DEMO_MAINTENANCE_HISTORY].forEach(arr => {
  arr.forEach(item => {
    if (!item.userId) item.userId = "user_demo_rajarshee";
  });
});
