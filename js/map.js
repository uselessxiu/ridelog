/**
 * Map Module
 * Leaflet.js interactive maps, OpenStreetMap Nominatim geocoding,
 * and OSRM routing calculations.
 */

import { vehicleService } from './services/vehicles.js';
import { serviceHistoryService } from './services/serviceHistory.js';
import { formatNumber, showToast } from './utils.js';

// Configuration for high-contrast dark telemetry map
export const MAP_CONFIG = {
  tileLayer: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  tileAttribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  geocodingEndpoint: 'https://nominatim.openstreetmap.org/search',
  routingEndpoint: 'https://router.project-osrm.org/route/v1/driving',
  defaultCenter: [22.5726, 88.3639], // Kolkata
  defaultZoom: 7
};

let previewMapInstance = null;
let previewRouteLayer = null;
let previewMarkers = [];

let viewRouteMapInstance = null;
let viewRouteLayer = null;
let viewRouteMarkers = [];

let explorationMapInstance = null;
let explorationMarkers = [];

/**
 * Geocode a location query string using Nominatim
 */
export async function geocodeLocation(query) {
  if (!query || !query.trim()) {
    throw new Error('Location query is empty.');
  }

  const url = `${MAP_CONFIG.geocodingEndpoint}?format=json&limit=1&q=${encodeURIComponent(query.trim())}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Geocoding failed with status ${response.status}`);
    }

    const data = await response.json();
    if (!data || data.length === 0) {
      throw new Error(`Location "${query}" could not be found. Try adding a city, state, or landmark.`);
    }

    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name
    };
  } catch (err) {
    console.error('Geocoding error:', err);
    throw err;
  }
}

/**
 * Fetch driving route and distance/duration using OSRM
 */
export async function fetchRouteData(startCoords, destCoords) {
  const url = `${MAP_CONFIG.routingEndpoint}/${startCoords.lon},${startCoords.lat};${destCoords.lon},${destCoords.lat}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Routing service returned status ${response.status}`);
    }

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) {
      throw new Error('No driving route could be calculated between these locations.');
    }

    const route = data.routes[0];
    const distanceKm = Math.round((route.distance / 1000) * 10) / 10;
    const durationSeconds = route.duration;
    
    // Format duration into readable hours and minutes
    const hours = Math.floor(durationSeconds / 3600);
    const mins = Math.round((durationSeconds % 3600) / 60);
    let timeStr = '';
    if (hours > 0) {
      timeStr = `~${hours} hr ${mins > 0 ? `${mins} min` : ''}`;
    } else {
      timeStr = `~${mins} min`;
    }

    return {
      distanceKm,
      durationText: timeStr,
      geometry: route.geometry // GeoJSON LineString
    };
  } catch (err) {
    console.error('Routing calculation error:', err);
    throw err;
  }
}

/**
 * Initialize or update the interactive preview map in Add Ride form
 */
export function renderPreviewMap(containerId, startCoords, destCoords, routeGeometry) {
  if (typeof L === 'undefined') {
    console.warn('Leaflet.js is not loaded.');
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) return;
  container.style.display = 'block';

  if (!previewMapInstance) {
    previewMapInstance = L.map(containerId, {
      zoomControl: true,
      attributionControl: false
    }).setView(MAP_CONFIG.defaultCenter, MAP_CONFIG.defaultZoom);

    L.tileLayer(MAP_CONFIG.tileLayer, {
      maxZoom: 18,
      attribution: MAP_CONFIG.tileAttribution
    }).addTo(previewMapInstance);
  }

  // Clear existing layers
  if (previewRouteLayer) {
    previewMapInstance.removeLayer(previewRouteLayer);
    previewRouteLayer = null;
  }
  previewMarkers.forEach(m => previewMapInstance.removeLayer(m));
  previewMarkers = [];

  // Create custom marker pins
  const startIcon = L.divIcon({
    className: 'custom-map-marker marker-start',
    html: `<div style="background: #10b981; width: 14px; height: 14px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  const destIcon = L.divIcon({
    className: 'custom-map-marker marker-dest',
    html: `<div style="background: #ef4444; width: 14px; height: 14px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  const startMarker = L.marker([startCoords.lat, startCoords.lon], { icon: startIcon }).addTo(previewMapInstance);
  const destMarker = L.marker([destCoords.lat, destCoords.lon], { icon: destIcon }).addTo(previewMapInstance);
  previewMarkers.push(startMarker, destMarker);

  if (routeGeometry) {
    const routeColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#3B82F6';
    previewRouteLayer = L.geoJSON(routeGeometry, {
      style: {
        color: routeColor,
        weight: 4.5,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }
    }).addTo(previewMapInstance);

    previewMapInstance.fitBounds(previewRouteLayer.getBounds(), { padding: [30, 30] });
  } else {
    const group = L.featureGroup([startMarker, destMarker]);
    previewMapInstance.fitBounds(group.getBounds(), { padding: [30, 30] });
  }

  // Invalidate size to handle dynamic display transitions
  setTimeout(() => {
    if (previewMapInstance) previewMapInstance.invalidateSize();
  }, 250);
}

/**
 * Open a saved route in the dedicated Route Map modal
 */
export function showSavedRouteModal(ride) {
  if (!ride.startLatitude || !ride.destinationLatitude) {
    return;
  }

  const modal = document.getElementById('modal-route-map');
  const titleEl = document.getElementById('route-map-title');
  const subtitleEl = document.getElementById('route-map-subtitle');
  const statsEl = document.getElementById('route-map-stats');

  if (titleEl) titleEl.textContent = ride.name || 'Ride Route';
  if (subtitleEl) subtitleEl.textContent = `${ride.startLocation || 'Start'} → ${ride.destination || 'Destination'}`;
  if (statsEl) {
    const distText = ride.routeDistance ? `${ride.routeDistance} km` : `${ride.distance} km`;
    const timeText = ride.estimatedTime ? ` · ${ride.estimatedTime}` : '';
    statsEl.textContent = `${distText}${timeText}`;
  }

  if (modal) modal.classList.add('active');

  const containerId = 'view-route-map-container';
  const startCoords = { lat: ride.startLatitude, lon: ride.startLongitude };
  const destCoords = { lat: ride.destinationLatitude, lon: ride.destinationLongitude };

  setTimeout(async () => {
    if (typeof L === 'undefined') return;

    if (!viewRouteMapInstance) {
      viewRouteMapInstance = L.map(containerId, {
        zoomControl: true,
        attributionControl: false
      }).setView(MAP_CONFIG.defaultCenter, MAP_CONFIG.defaultZoom);

      L.tileLayer(MAP_CONFIG.tileLayer, {
        maxZoom: 18,
        attribution: MAP_CONFIG.tileAttribution
      }).addTo(viewRouteMapInstance);
    }

    viewRouteMapInstance.invalidateSize();

    // Clear old
    if (viewRouteLayer) {
      viewRouteMapInstance.removeLayer(viewRouteLayer);
      viewRouteLayer = null;
    }
    viewRouteMarkers.forEach(m => viewRouteMapInstance.removeLayer(m));
    viewRouteMarkers = [];

    const startIcon = L.divIcon({
      className: 'custom-map-marker',
      html: `<div style="background: #10b981; width: 14px; height: 14px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const destIcon = L.divIcon({
      className: 'custom-map-marker',
      html: `<div style="background: #ef4444; width: 14px; height: 14px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7]
    });

    const startMarker = L.marker([startCoords.lat, startCoords.lon], { icon: startIcon }).addTo(viewRouteMapInstance);
    const destMarker = L.marker([destCoords.lat, destCoords.lon], { icon: destIcon }).addTo(viewRouteMapInstance);
    viewRouteMarkers.push(startMarker, destMarker);

    // Fetch and display route line
    try {
      const routeData = await fetchRouteData(startCoords, destCoords);
      if (routeData && routeData.geometry) {
        const routeColor = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#3B82F6';
        viewRouteLayer = L.geoJSON(routeData.geometry, {
          style: {
            color: routeColor,
            weight: 5,
            opacity: 0.9,
            lineCap: 'round',
            lineJoin: 'round'
          }
        }).addTo(viewRouteMapInstance);

        viewRouteMapInstance.fitBounds(viewRouteLayer.getBounds(), { padding: [30, 30] });
      }
    } catch (e) {
      // Fallback: fit markers
      const group = L.featureGroup([startMarker, destMarker]);
      viewRouteMapInstance.fitBounds(group.getBounds(), { padding: [30, 30] });
    }
  }, 200);
}

/**
 * Render the dedicated Exploration & Telemetry Map screen
 */
export function renderExplorationMap(containerId = 'full-exploration-map', navigateToTab = null) {
  if (typeof L === 'undefined') {
    console.warn('Leaflet.js is not loaded.');
    return;
  }

  const container = document.getElementById(containerId);
  if (!container) return;

  const activeBike = vehicleService.getActiveVehicle();
  const allRides = serviceHistoryService.getAllRides();
  const currentOdo = Number(activeBike?.currentMileage ?? activeBike?.currentOdo) || 0;

  // Update telemetry header
  const nameEl = document.getElementById('map-telemetry-bike-name');
  const regEl = document.getElementById('map-telemetry-reg');
  const odoEl = document.getElementById('map-telemetry-odo');
  const routesCountEl = document.getElementById('map-telemetry-routes-count');

  if (nameEl) nameEl.textContent = activeBike ? (activeBike.nickname || activeBike.name) : 'No machine selected';
  if (regEl) regEl.textContent = activeBike ? (activeBike.registrationNumber || 'Registration Pending') : '—';
  if (odoEl) odoEl.innerHTML = `${formatNumber(currentOdo)} <small style="font-size: 0.75rem; color: #64748B;">km</small>`;
  if (routesCountEl) routesCountEl.textContent = allRides.filter(r => r.startLatitude && r.destinationLatitude).length;

  if (!explorationMapInstance) {
    explorationMapInstance = L.map(containerId, {
      zoomControl: true,
      attributionControl: false
    }).setView(MAP_CONFIG.defaultCenter, MAP_CONFIG.defaultZoom);

    L.tileLayer(MAP_CONFIG.tileLayer, {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: MAP_CONFIG.tileAttribution
    }).addTo(explorationMapInstance);

    // Setup Locate Me button
    const locateBtn = document.getElementById('btn-map-locate-me');
    if (locateBtn) {
      locateBtn.addEventListener('click', () => {
        if ('geolocation' in navigator) {
          locateBtn.disabled = true;
          locateBtn.textContent = 'Locating...';
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude } = pos.coords;
              explorationMapInstance.setView([latitude, longitude], 13);

              const userIcon = L.divIcon({
                className: 'custom-map-marker',
                html: `<div style="background: #3B82F6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 0 12px #3B82F6;"></div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8]
              });

              L.marker([latitude, longitude], { icon: userIcon })
                .addTo(explorationMapInstance)
                .bindPopup('<strong style="color: #0E1526;">Current GPS Location</strong>')
                .openPopup();

              locateBtn.disabled = false;
              locateBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                </svg>
                <span>My Location</span>
              `;
              showToast('Location updated', 'success');
            },
            (err) => {
              locateBtn.disabled = false;
              locateBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"></polygon>
                </svg>
                <span>My Location</span>
              `;
              showToast('Could not retrieve GPS location: ' + err.message, 'danger');
            },
            { timeout: 8000 }
          );
        } else {
          showToast('Geolocation is not supported by your browser', 'danger');
        }
      });
    }

    const logRideBtn = document.getElementById('btn-map-log-ride');
    if (logRideBtn && navigateToTab) {
      logRideBtn.addEventListener('click', () => navigateToTab('add-ride'));
    }
  }

  // Clear existing markers
  explorationMarkers.forEach(m => explorationMapInstance.removeLayer(m));
  explorationMarkers = [];

  // Plot existing routes if any
  const routeBounds = [];
  allRides.forEach(ride => {
    if (ride.startLatitude && ride.startLongitude) {
      const pin = L.divIcon({
        className: 'custom-map-marker',
        html: `<div style="background: #10B981; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.5);"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });
      const marker = L.marker([ride.startLatitude, ride.startLongitude], { icon: pin }).addTo(explorationMapInstance);
      marker.bindPopup(`<strong style="color: #0E1526;">${ride.name || 'Ride'}</strong><br><span style="color: #64748B;">${ride.startLocation || ''}</span>`);
      explorationMarkers.push(marker);
      routeBounds.push([ride.startLatitude, ride.startLongitude]);
    }
    if (ride.destinationLatitude && ride.destinationLongitude) {
      const destPin = L.divIcon({
        className: 'custom-map-marker',
        html: `<div style="background: #EF4444; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.5);"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6]
      });
      const destMarker = L.marker([ride.destinationLatitude, ride.destinationLongitude], { icon: destPin }).addTo(explorationMapInstance);
      destMarker.bindPopup(`<strong style="color: #0E1526;">${ride.name || 'Destination'}</strong><br><span style="color: #64748B;">${ride.destination || ''}</span>`);
      explorationMarkers.push(destMarker);
      routeBounds.push([ride.destinationLatitude, ride.destinationLongitude]);
    }
  });

  if (routeBounds.length > 0) {
    try {
      explorationMapInstance.fitBounds(routeBounds, { padding: [40, 40] });
    } catch(e){}
  }

  setTimeout(() => {
    if (explorationMapInstance) explorationMapInstance.invalidateSize();
  }, 250);
}


