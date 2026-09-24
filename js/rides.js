/**
 * Rides Module
 * Extended with:
 * - Start Location and Destination geocoding + Leaflet route preview
 * - Optional route distance and estimated travel time
 * - BikeId association for multi-motorcycle support
 * - "View Route" map button in Ride Details modal
 */

import { storage } from './storage.js';
import { vehicleService } from './services/vehicles.js';
import { serviceHistoryService } from './services/serviceHistory.js';
import { authService } from './services/auth.js';
import { generateId, formatNumber, formatCurrency, formatDate, getTodayDateString, showToast } from './utils.js';
import { geocodeLocation, fetchRouteData, renderPreviewMap, showSavedRouteModal } from './map.js';

let currentEditingRideId = null;
let currentViewingRideId = null;

// Temporary holder for calculated route info during Add Ride
let currentRouteData = null;

export function initRidesModule(navigateToTab) {
  setupAddRideForm(navigateToTab);
  setupRideHistoryControls(navigateToTab);
  setupRideDetailModal(navigateToTab);
  setupMapRouteControls();
}

/**
 * -------------------------------------------------------------
 * 1. ADD / EDIT RIDE FORM & LIVE CALCULATIONS & MAP
 * -------------------------------------------------------------
 */
function setupAddRideForm(navigateToTab) {
  const form = document.getElementById('form-add-ride');
  const startKmInput = document.getElementById('input-start-km');
  const endKmInput = document.getElementById('input-end-km');
  const fuelInput = document.getElementById('input-fuel');
  const fuelPriceInput = document.getElementById('input-fuel-price');
  const dateInput = document.getElementById('input-ride-date');

  // Set default date to today
  if (dateInput && !dateInput.value) {
    dateInput.value = getTodayDateString();
  }

  // Pre-fill starting odometer from active bike
  prefillStartKm();

  // Listen to input events for real-time calculation preview
  const inputsToListen = [startKmInput, endKmInput, fuelInput, fuelPriceInput];
  inputsToListen.forEach(input => {
    if (input) {
      input.addEventListener('input', () => {
        calculateLiveValues();
        validateField(input);
      });
    }
  });

  // Handle Form Submit
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleRideSubmit(navigateToTab);
    });
  }

  // Cancel edit button
  const cancelEditBtn = document.getElementById('btn-cancel-edit-ride');
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      resetRideForm();
      navigateToTab('rides');
    });
  }
}

function setupMapRouteControls() {
  const showRouteBtn = document.getElementById('btn-show-route');
  const startLocInput = document.getElementById('input-start-location');
  const destLocInput = document.getElementById('input-dest-location');
  const mapStatusMsg = document.getElementById('map-calc-status');
  const routeInput = document.getElementById('input-ride-route');

  if (showRouteBtn) {
    showRouteBtn.addEventListener('click', async () => {
      const startQuery = startLocInput.value.trim();
      const destQuery = destLocInput.value.trim();

      if (!startQuery || !destQuery) {
        showToast('Enter where you started and where you headed to preview the route', 'danger');
        return;
      }

      showRouteBtn.disabled = true;
      showRouteBtn.textContent = 'Finding the best route...';
      if (mapStatusMsg) {
        mapStatusMsg.style.display = 'block';
        mapStatusMsg.textContent = 'Finding places and charting your route...';
        mapStatusMsg.style.color = 'var(--text-muted)';
      }

      try {
        // 1. Geocode both locations
        const [startCoords, destCoords] = await Promise.all([
          geocodeLocation(startQuery),
          geocodeLocation(destQuery)
        ]);

        // 2. Fetch routing polyline & distance
        const route = await fetchRouteData(startCoords, destCoords);

        // Store route data
        currentRouteData = {
          startLocation: startQuery,
          destination: destQuery,
          startLatitude: startCoords.lat,
          startLongitude: startCoords.lon,
          destinationLatitude: destCoords.lat,
          destinationLongitude: destCoords.lon,
          routeDistance: route.distanceKm,
          estimatedTime: route.durationText,
          geometry: route.geometry
        };

        // Render preview map
        renderPreviewMap('add-ride-map-container', startCoords, destCoords, route.geometry);

        // Show info bar
        if (mapStatusMsg) {
          mapStatusMsg.style.display = 'block';
          mapStatusMsg.innerHTML = `<strong>${route.distanceKm} km</strong> · Estimated travel time: <strong>${route.durationText}</strong>`;
          mapStatusMsg.style.color = 'var(--accent)';
        }

        // Auto-fill route text input if empty
        if (routeInput && !routeInput.value.trim()) {
          routeInput.value = `${startQuery} → ${destQuery}`;
        }

        // Suggest ending odometer if start odometer is entered and end odometer is empty
        const startKmVal = parseFloat(document.getElementById('input-start-km').value);
        const endKmInput = document.getElementById('input-end-km');
        if (startKmVal > 0 && endKmInput && !endKmInput.value) {
          endKmInput.value = Math.round(startKmVal + route.distanceKm);
          calculateLiveValues();
        }

        showToast('Route charted and ready to log', 'success');
      } catch (err) {
        console.error('Route calculation error:', err);
        if (mapStatusMsg) {
          mapStatusMsg.style.display = 'block';
          mapStatusMsg.textContent = `Route error: ${err.message || 'Unable to compute route.'}`;
          mapStatusMsg.style.color = 'var(--danger)';
        }
        showToast(err.message || "Couldn't find a driving route between those locations.", 'danger');
      } finally {
        showRouteBtn.disabled = false;
        showRouteBtn.textContent = 'Preview route';
      }
    });
  }
}

export function prefillStartKm() {
  const startKmInput = document.getElementById('input-start-km');
  if (!startKmInput || startKmInput.value) return;

  const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();
  const bikeRides = activeBike ? serviceHistoryService.getRides(activeBike.id) : [];

  if (bikeRides.length > 0 && bikeRides[0].endKm) {
    startKmInput.value = bikeRides[0].endKm;
  } else if (activeBike && (activeBike.currentMileage ?? activeBike.currentOdo)) {
    startKmInput.value = activeBike.currentMileage ?? activeBike.currentOdo;
  }
}

function calculateLiveValues() {
  const startKm = parseFloat(document.getElementById('input-start-km').value) || 0;
  const endKm = parseFloat(document.getElementById('input-end-km').value) || 0;
  const fuel = parseFloat(document.getElementById('input-fuel').value) || 0;
  const fuelPrice = parseFloat(document.getElementById('input-fuel-price').value) || 0;

  let distance = 0;
  let mileage = 0;
  let fuelCost = 0;
  let costPerKm = 0;

  if (endKm > startKm) {
    distance = endKm - startKm;
  }

  if (distance > 0 && fuel > 0) {
    mileage = (distance / fuel).toFixed(1);
  }

  if (fuel > 0 && fuelPrice > 0) {
    fuelCost = fuel * fuelPrice;
  }

  if (distance > 0 && fuelCost > 0) {
    costPerKm = (fuelCost / distance).toFixed(2);
  }

  // Update live preview elements
  const previewDist = document.getElementById('calc-dist');
  const previewMileage = document.getElementById('calc-mileage');
  const previewCost = document.getElementById('calc-cost');
  const previewPerKm = document.getElementById('calc-per-km');

  if (previewDist) previewDist.textContent = `${formatNumber(distance)} km`;
  if (previewMileage) previewMileage.textContent = `${mileage > 0 ? mileage : '0.0'} km/L`;
  if (previewCost) previewCost.textContent = formatCurrency(fuelCost);
  if (previewPerKm) previewPerKm.textContent = `₹${costPerKm > 0 ? costPerKm : '0.00'}/km`;
}

function validateField(input) {
  const id = input.id;
  const val = parseFloat(input.value);
  const errorEl = document.getElementById(`err-${id}`);

  let isValid = true;
  let message = '';

  const startKm = parseFloat(document.getElementById('input-start-km').value) || 0;

  if (id === 'input-start-km') {
    if (isNaN(val) || val < 0) {
      isValid = false;
      message = "Starting odometer can't be negative";
    }
  } else if (id === 'input-end-km') {
    if (isNaN(val)) {
      isValid = false;
      message = 'Please enter your ending odometer reading';
    } else if (val <= startKm) {
      isValid = false;
      message = 'Ending odometer should be higher than starting odometer';
    }
  } else if (id === 'input-fuel') {
    if (isNaN(val) || val <= 0) {
      isValid = false;
      message = 'Enter how much fuel you filled (in Litres)';
    }
  } else if (id === 'input-fuel-price') {
    if (isNaN(val) || val <= 0) {
      isValid = false;
      message = 'Enter the fuel price per litre';
    }
  }

  if (errorEl) {
    if (!isValid) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
      input.classList.add('invalid');
    } else {
      errorEl.textContent = '';
      errorEl.classList.remove('visible');
      input.classList.remove('invalid');
    }
  }

  return isValid;
}

function handleRideSubmit(navigateToTab) {
  const nameInput = document.getElementById('input-ride-name');
  const routeInput = document.getElementById('input-ride-route');
  const dateInput = document.getElementById('input-ride-date');
  const startKmInput = document.getElementById('input-start-km');
  const endKmInput = document.getElementById('input-end-km');
  const fuelInput = document.getElementById('input-fuel');
  const fuelPriceInput = document.getElementById('input-fuel-price');
  const notesInput = document.getElementById('input-ride-notes');

  const startLocInput = document.getElementById('input-start-location');
  const destLocInput = document.getElementById('input-dest-location');

  // Validate all fields
  const v1 = validateField(startKmInput);
  const v2 = validateField(endKmInput);
  const v3 = validateField(fuelInput);
  const v4 = validateField(fuelPriceInput);

  let hasEmptyRequired = false;
  if (!routeInput.value.trim()) {
    showInlineError('input-ride-route', 'Give your route a name (e.g. Guwahati → Shillong)');
    hasEmptyRequired = true;
  } else {
    clearInlineError('input-ride-route');
  }

  if (!v1 || !v2 || !v3 || !v4 || hasEmptyRequired) {
    showToast('Please check the highlighted fields before saving', 'danger');
    return;
  }

  const startKm = parseFloat(startKmInput.value);
  const endKm = parseFloat(endKmInput.value);
  const fuel = parseFloat(fuelInput.value);
  const fuelPrice = parseFloat(fuelPriceInput.value);

  const distance = Math.round((endKm - startKm) * 10) / 10;
  const mileage = Math.round((distance / fuel) * 10) / 10;
  const fuelCost = Math.round(fuel * fuelPrice * 100) / 100;
  const costPerKm = Math.round((fuelCost / distance) * 100) / 100;

  const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();

  const ridePayload = {
    id: currentEditingRideId || generateId('ride'),
    bikeId: activeBike ? activeBike.id : 'bike_demo_hunter350',
    vehicleId: activeBike ? activeBike.id : 'bike_demo_hunter350',
    userId: authService.getUserId() || 'user_demo_rajarshee',
    name: nameInput.value.trim() || 'Motorcycle Ride',
    route: routeInput.value.trim(),
    date: dateInput.value || getTodayDateString(),
    startKm,
    endKm,
    distance,
    fuel,
    fuelPrice,
    fuelCost,
    mileage,
    costPerKm,
    notes: notesInput.value.trim(),

    // Map location fields (optional)
    startLocation: startLocInput?.value.trim() || currentRouteData?.startLocation || '',
    destination: destLocInput?.value.trim() || currentRouteData?.destination || '',
    startLatitude: currentRouteData?.startLatitude || null,
    startLongitude: currentRouteData?.startLongitude || null,
    destinationLatitude: currentRouteData?.destinationLatitude || null,
    destinationLongitude: currentRouteData?.destinationLongitude || null,
    routeDistance: currentRouteData?.routeDistance || null,
    estimatedTime: currentRouteData?.estimatedTime || null
  };

  if (currentEditingRideId) {
    serviceHistoryService.updateRide(currentEditingRideId, ridePayload);
    showToast('Ride details updated', 'success');
  } else {
    serviceHistoryService.addRide(ridePayload);
    showToast('Ride logged to history', 'success');
  }

  resetRideForm();
  navigateToTab('rides');
}

function showInlineError(fieldId, message) {
  const errEl = document.getElementById(`err-${fieldId}`);
  const inputEl = document.getElementById(fieldId);
  if (errEl) {
    errEl.textContent = message;
    errEl.classList.add('visible');
  }
  if (inputEl) inputEl.classList.add('invalid');
}

function clearInlineError(fieldId) {
  const errEl = document.getElementById(`err-${fieldId}`);
  const inputEl = document.getElementById(fieldId);
  if (errEl) {
    errEl.textContent = '';
    errEl.classList.remove('visible');
  }
  if (inputEl) inputEl.classList.remove('invalid');
}

export function resetRideForm() {
  currentEditingRideId = null;
  currentRouteData = null;

  const form = document.getElementById('form-add-ride');
  if (form) form.reset();

  const title = document.getElementById('add-ride-title');
  if (title) title.textContent = 'Log a ride';

  const submitBtn = document.getElementById('btn-save-ride');
  if (submitBtn) submitBtn.textContent = 'Save ride';

  const cancelBtn = document.getElementById('btn-cancel-edit-ride');
  if (cancelBtn) cancelBtn.style.display = 'none';

  const dateInput = document.getElementById('input-ride-date');
  if (dateInput) dateInput.value = getTodayDateString();

  // Hide map preview
  const mapContainer = document.getElementById('add-ride-map-container');
  if (mapContainer) mapContainer.style.display = 'none';

  const mapStatusMsg = document.getElementById('map-calc-status');
  if (mapStatusMsg) mapStatusMsg.style.display = 'none';

  // Clear all errors
  document.querySelectorAll('.form-error').forEach(el => el.classList.remove('visible'));
  document.querySelectorAll('.form-input').forEach(el => el.classList.remove('invalid'));

  prefillStartKm();
  calculateLiveValues();
}

export function populateEditRideForm(rideId, navigateToTab) {
  const ride = serviceHistoryService.getRideById(rideId);
  if (!ride) return;

  currentEditingRideId = ride.id;

  document.getElementById('input-ride-name').value = ride.name || '';
  document.getElementById('input-ride-route').value = ride.route || '';
  document.getElementById('input-ride-date').value = ride.date || '';
  document.getElementById('input-start-km').value = ride.startKm || '';
  document.getElementById('input-end-km').value = ride.endKm || '';
  document.getElementById('input-fuel').value = ride.fuel || '';
  document.getElementById('input-fuel-price').value = ride.fuelPrice || '';
  document.getElementById('input-ride-notes').value = ride.notes || '';

  const startLocInput = document.getElementById('input-start-location');
  const destLocInput = document.getElementById('input-dest-location');
  if (startLocInput) startLocInput.value = ride.startLocation || '';
  if (destLocInput) destLocInput.value = ride.destination || '';

  if (ride.startLatitude && ride.destinationLatitude) {
    currentRouteData = {
      startLocation: ride.startLocation,
      destination: ride.destination,
      startLatitude: ride.startLatitude,
      startLongitude: ride.startLongitude,
      destinationLatitude: ride.destinationLatitude,
      destinationLongitude: ride.destinationLongitude,
      routeDistance: ride.routeDistance,
      estimatedTime: ride.estimatedTime
    };

    renderPreviewMap(
      'add-ride-map-container',
      { lat: ride.startLatitude, lon: ride.startLongitude },
      { lat: ride.destinationLatitude, lon: ride.destinationLongitude }
    );
  }

  const title = document.getElementById('add-ride-title');
  if (title) title.textContent = 'Edit ride details';

  const submitBtn = document.getElementById('btn-save-ride');
  if (submitBtn) submitBtn.textContent = 'Update ride';

  const cancelBtn = document.getElementById('btn-cancel-edit-ride');
  if (cancelBtn) cancelBtn.style.display = 'block';

  calculateLiveValues();
  navigateToTab('add-ride');
}

/**
 * -------------------------------------------------------------
 * 2. RIDE HISTORY (SEARCH, SORT, FILTER, RENDER)
 * -------------------------------------------------------------
 */
function setupRideHistoryControls(navigateToTab) {
  const searchInput = document.getElementById('input-ride-search');
  const sortSelect = document.getElementById('select-ride-sort');

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderRideHistory(navigateToTab);
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      renderRideHistory(navigateToTab);
    });
  }
}

export function renderRideHistory(navigateToTab) {
  const container = document.getElementById('rides-history-list');
  if (!container) return;

  const searchInput = document.getElementById('input-ride-search');
  const sortSelect = document.getElementById('select-ride-sort');

  const searchQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const sortBy = sortSelect ? sortSelect.value : 'newest';

  const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();
  let allBikeRides = activeBike ? serviceHistoryService.getRides(activeBike.id) : [];

  // Calculate and update Rides Summary Stats Band
  const totalKmEl = document.getElementById('rides-stat-total-km');
  const countEl = document.getElementById('rides-stat-count');
  const avgMileageEl = document.getElementById('rides-stat-avg-mileage');
  const fuelSpentEl = document.getElementById('rides-stat-fuel-spent');
  const subtitleEl = document.getElementById('rides-history-subtitle');

  if (subtitleEl && activeBike) {
    subtitleEl.textContent = `Every road, route, and stop logged for ${activeBike.name}.`;
  }

  const totalKm = allBikeRides.reduce((sum, r) => sum + (Number(r.distance) || 0), 0);
  const totalCost = allBikeRides.reduce((sum, r) => sum + (Number(r.fuelCost) || 0), 0);
  const mileageRides = allBikeRides.filter(r => Number(r.mileage) > 0);
  const avgMileage = mileageRides.length > 0
    ? (mileageRides.reduce((sum, r) => sum + Number(r.mileage), 0) / mileageRides.length).toFixed(1)
    : '—';

  if (totalKmEl) totalKmEl.innerHTML = `${formatNumber(Math.round(totalKm))} <small style="font-size: 0.75rem; color: #64748B;">km</small>`;
  if (countEl) countEl.textContent = String(allBikeRides.length);
  if (avgMileageEl) avgMileageEl.innerHTML = `${avgMileage} <small style="font-size: 0.75rem; color: #64748B;">km/L</small>`;
  if (fuelSpentEl) fuelSpentEl.textContent = formatCurrency(Math.round(totalCost));

  // Wire Add Ride Header Button
  const logBtn = document.getElementById('btn-history-log-ride');
  if (logBtn && !logBtn._bound) {
    logBtn._bound = true;
    logBtn.addEventListener('click', () => navigateToTab('add-ride'));
  }

  let rides = [...allBikeRides];

  // Search filter
  if (searchQuery) {
    rides = rides.filter(ride => {
      const nameMatch = (ride.name || '').toLowerCase().includes(searchQuery);
      const routeMatch = (ride.route || '').toLowerCase().includes(searchQuery);
      const startMatch = (ride.startLocation || '').toLowerCase().includes(searchQuery);
      const destMatch = (ride.destination || '').toLowerCase().includes(searchQuery);
      return nameMatch || routeMatch || startMatch || destMatch;
    });
  }

  // Sort logic
  rides.sort((a, b) => {
    if (sortBy === 'newest') return new Date(b.date) - new Date(a.date);
    if (sortBy === 'oldest') return new Date(a.date) - new Date(b.date);
    if (sortBy === 'longest') return (b.distance || 0) - (a.distance || 0);
    if (sortBy === 'mileage') return (b.mileage || 0) - (a.mileage || 0);
    return 0;
  });

  if (rides.length === 0) {
    if (searchQuery) {
      container.innerHTML = `
        <div style="background: #0B101D; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; padding: 48px 24px; text-align: center; color: #64748B;">
          <div style="font-weight: 800; font-size: 1.2rem; color: #FFFFFF; margin-bottom: 6px;">No rides match "${searchQuery}"</div>
          <div style="font-size: 0.88rem; color: #94A3B8;">Try searching for a different destination or route waypoint.</div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="background: #0B101D; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 18px; padding: 48px 24px; text-align: center; color: #64748B;">
          <div style="width: 52px; height: 52px; border-radius: 14px; background: rgba(37, 99, 235, 0.12); color: #3B82F6; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polygon points="12 8 8 12 12 16 16 12 12 8"></polygon>
            </svg>
          </div>
          <div style="font-weight: 800; font-size: 1.25rem; color: #FFFFFF; margin-bottom: 6px;">No Journeys Recorded for ${activeBike.name}</div>
          <div style="font-size: 0.88rem; color: #94A3B8; margin-bottom: 20px; max-width: 440px; margin-left: auto; margin-right: auto;">Every great journey starts with the first kilometer. Record your route to track fuel consumption and distance telemetry.</div>
          <button class="btn-cockpit-primary" id="btn-history-add-first" style="margin: 0 auto;">+ Log First Ride</button>
        </div>
      `;
      const btn = document.getElementById('btn-history-add-first');
      if (btn) btn.addEventListener('click', () => navigateToTab('add-ride'));
    }
    return;
  }

  container.innerHTML = `
    <div class="rides-timeline-list">
      ${rides.map(ride => `
        <div class="journey-log-card" data-id="${ride.id}">
          <div class="journey-route-wrap">
            <div class="journey-route-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"></polygon>
                <line x1="8" y1="2" x2="8" y2="18"></line>
                <line x1="16" y1="6" x2="16" y2="22"></line>
              </svg>
            </div>
            <div>
              <div class="journey-title-line" style="display: flex; align-items: center; gap: 8px;">
                <span>${ride.name || ride.route || 'Ride'}</span>
                ${ride.startLatitude ? '<span class="badge" style="background: rgba(37, 99, 235, 0.15); color: #3B82F6; font-size: 0.68rem; padding: 2px 8px; border-radius: 6px;">Mapped Route</span>' : ''}
              </div>
              <div class="journey-date-line">
                <span>${ride.route || ''}</span>
                <span style="margin: 0 6px;">•</span>
                <span>${formatDate(ride.date)}</span>
              </div>
            </div>
          </div>

          <div class="journey-telemetry-cluster">
            <div class="journey-tel-col">
              <span class="journey-tel-val tabular-nums">${formatNumber(ride.distance || 0)} km</span>
              <div class="journey-tel-lbl">Distance</div>
            </div>
            <div class="journey-tel-col">
              <span class="journey-tel-val tabular-nums">${ride.mileage ? `${ride.mileage} km/L` : '—'}</span>
              <div class="journey-tel-lbl">Economy</div>
            </div>
            <div class="journey-tel-col">
              <span class="journey-tel-val tabular-nums">${formatCurrency(ride.fuelCost || 0)}</span>
              <div class="journey-tel-lbl">Fuel Spent</div>
            </div>
            <button class="btn-cockpit-outline btn-inspect-ride" data-id="${ride.id}" style="padding: 7px 14px; font-size: 0.78rem;">
              Details →
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('.journey-log-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      openRideDetailModal(id);
    });
  });
}

/**
 * -------------------------------------------------------------
 * 3. RIDE DETAIL MODAL (VIEW, EDIT, DELETE, MAP ROUTE)
 * -------------------------------------------------------------
 */
function setupRideDetailModal(navigateToTab) {
  const modal = document.getElementById('modal-ride-detail');
  const closeBtn = document.getElementById('btn-close-ride-modal');
  const editBtn = document.getElementById('btn-edit-ride-modal');
  const deleteBtn = document.getElementById('btn-delete-ride-modal');
  const viewRouteBtn = document.getElementById('btn-view-route-map');
  const closeRouteMapBtn = document.getElementById('btn-close-route-map-modal');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeRideDetailModal());
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeRideDetailModal();
    });
  }

  if (editBtn) {
    editBtn.addEventListener('click', () => {
      if (currentViewingRideId) {
        const idToEdit = currentViewingRideId;
        closeRideDetailModal();
        populateEditRideForm(idToEdit, navigateToTab);
      }
    });
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', () => {
      if (currentViewingRideId) {
        confirmDeleteRide(currentViewingRideId, navigateToTab);
      }
    });
  }

  if (viewRouteBtn) {
    viewRouteBtn.addEventListener('click', () => {
      if (currentViewingRideId) {
        const ride = serviceHistoryService.getRideById(currentViewingRideId);
        if (ride) {
          showSavedRouteModal(ride);
        }
      }
    });
  }

  if (closeRouteMapBtn) {
    closeRouteMapBtn.addEventListener('click', () => {
      const routeModal = document.getElementById('modal-route-map');
      if (routeModal) routeModal.classList.remove('active');
    });
  }
}

export function openRideDetailModal(rideId) {
  const ride = serviceHistoryService.getRideById(rideId);
  if (!ride) return;

  currentViewingRideId = rideId;

  document.getElementById('modal-ride-name').textContent = ride.name || 'Ride Details';
  document.getElementById('modal-ride-route').textContent = ride.route || 'Route';
  document.getElementById('modal-ride-date').textContent = formatDate(ride.date);
  document.getElementById('modal-ride-dist').textContent = `${formatNumber(ride.distance)} km`;
  document.getElementById('modal-ride-start-km').textContent = `${formatNumber(ride.startKm)} km`;
  document.getElementById('modal-ride-end-km').textContent = `${formatNumber(ride.endKm)} km`;
  document.getElementById('modal-ride-fuel').textContent = `${ride.fuel} L`;
  document.getElementById('modal-ride-price').textContent = `₹${ride.fuelPrice}/L`;
  document.getElementById('modal-ride-mileage').textContent = `${ride.mileage} km/L`;
  document.getElementById('modal-ride-cost').textContent = formatCurrency(ride.fuelCost);
  document.getElementById('modal-ride-cost-km').textContent = `₹${ride.costPerKm}/km`;

  // Map "View Route" button visibility
  const viewRouteBtn = document.getElementById('btn-view-route-map');
  if (viewRouteBtn) {
    if (ride.startLatitude && ride.destinationLatitude) {
      viewRouteBtn.style.display = 'inline-flex';
    } else {
      viewRouteBtn.style.display = 'none';
    }
  }

  const notesEl = document.getElementById('modal-ride-notes');
  const notesContainer = document.getElementById('modal-ride-notes-container');
  if (ride.notes) {
    notesEl.textContent = ride.notes;
    notesContainer.style.display = 'block';
  } else {
    notesContainer.style.display = 'none';
  }

  const modal = document.getElementById('modal-ride-detail');
  if (modal) modal.classList.add('active');
}

function closeRideDetailModal() {
  const modal = document.getElementById('modal-ride-detail');
  if (modal) modal.classList.remove('active');
  currentViewingRideId = null;
}

function confirmDeleteRide(rideId, navigateToTab) {
  const confirmed = window.confirm('Delete this ride from your log? This cannot be undone.');
  if (confirmed) {
    serviceHistoryService.deleteRide(rideId);
    closeRideDetailModal();
    showToast('Ride removed from your history', 'normal');
    renderRideHistory(navigateToTab);
  }
}
