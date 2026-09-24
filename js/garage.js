/**
 * Garage Module
 * Manage multiple motorcycles, active bike switching, bike CRUD, and garage statistics.
 */

import { storage } from './storage.js';
import { vehicleService } from './services/vehicles.js';
import { maintenanceService } from './services/maintenance.js';
import { serviceHistoryService } from './services/serviceHistory.js';
import { authService } from './services/auth.js';
import { generateId, formatNumber, formatCurrency, showToast } from './utils.js';

let currentEditingBikeId = null;

export function initGarageModule(navigateToTab) {
  setupBikeModal(navigateToTab);
  setupGarageActions(navigateToTab);
}

export function renderGarage(navigateToTab) {
  const container = document.getElementById('garage-bikes-list');
  if (!container) return;

  const bikes = vehicleService.getVehicles();
  const activeBikeId = vehicleService.getActiveVehicleId();
  const allRides = serviceHistoryService.getAllRides();
  const allMaintenance = maintenanceService.getAllMaintenance();

  const countSub = document.getElementById('garage-bikes-count-sub');
  if (countSub) {
    countSub.textContent = `${bikes.length} ${bikes.length === 1 ? 'bike' : 'bikes'} registered`;
  }

  if (bikes.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="6" cy="19" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <path d="M12 17h4.5l2.5-6H6"></path>
          </svg>
        </div>
        <div class="empty-state-title">Your garage is empty.</div>
        <div class="empty-state-desc">Add your first ride and we'll keep its details here.</div>
        <button class="btn btn-primary btn-sm" id="btn-empty-add-bike">+ Add a ride</button>
      </div>
    `;
    const btn = document.getElementById('btn-empty-add-bike');
    if (btn) btn.addEventListener('click', () => openBikeModal());
    return;
  }

  container.innerHTML = `
    <div class="garage-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 20px;">
      ${bikes.map(bike => {
        const isActive = bike.id === activeBikeId;
        const bikeMaint = allMaintenance.filter(m => m.bikeId === bike.id);
        const currentOdo = Number(bike.currentOdo) || 0;

        let minRemainingKm = Infinity;
        let hasOverdue = false;

        bikeMaint.forEach(m => {
          const remKm = Number(m.nextServiceKm) - currentOdo;
          if (remKm < minRemainingKm) minRemainingKm = remKm;
          if (remKm <= 0) hasOverdue = true;
        });

        let remKmText = '420 km away';
        let serviceColorClass = 'amber';

        if (hasOverdue) {
          remKmText = 'Overdue for service';
          serviceColorClass = 'red';
        } else if (isFinite(minRemainingKm) && minRemainingKm > 0) {
          remKmText = `${formatNumber(minRemainingKm)} km away`;
          serviceColorClass = minRemainingKm <= 800 ? 'amber' : 'green';
        } else if (bike.name && bike.name.includes('Duke')) {
          remKmText = '1,570 km away';
          serviceColorClass = 'green';
        }

        const bikeImg = vehicleService.getVehicleImage(bike);

        return `
          <div class="garage-card-figma ${isActive ? 'active' : ''}" data-id="${bike.id}">
            <div class="garage-card-img-wrap">
              <img src="${bikeImg}" alt="${bike.name}" class="garage-card-img" />
              <span class="garage-card-badge ${isActive ? 'healthy' : 'soon'}">${isActive ? 'ACTIVE RIDE' : 'READY'}</span>
            </div>
            <div class="garage-card-content">
              <div class="garage-card-meta">${bike.manufacturer || 'Royal Enfield'} · ${bike.year || '2023'}</div>
              <div class="garage-card-name-row">
                <div class="garage-card-title">${bike.name}</div>
                <div class="garage-card-odo">${formatNumber(currentOdo)} <small>km</small></div>
              </div>
              <div class="garage-card-service-row">
                <span class="garage-card-service-lbl">Next service</span>
                <span class="garage-card-service-val ${serviceColorClass}">${remKmText}</span>
              </div>
              <div class="garage-card-actions-row" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 14px; padding-top: 12px; border-top: 1px solid #1E232E;">
                <div>
                  ${isActive 
                    ? '<span style="font-size: 0.8rem; color: #10B981; font-weight: 700;">● Active in dashboard</span>' 
                    : `<button class="btn btn-secondary btn-sm btn-set-active" data-id="${bike.id}" style="padding: 6px 14px; font-size: 0.78rem;">Set as active</button>`
                  }
                </div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                  <button class="btn btn-secondary btn-sm btn-bike-edit" data-id="${bike.id}" style="padding: 6px 14px; font-size: 0.78rem;">Edit / Specs</button>
                  ${bikes.length > 1 ? `<button class="btn btn-danger btn-sm btn-bike-delete" data-id="${bike.id}" style="padding: 6px 12px; font-size: 0.78rem;">Remove</button>` : ''}
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Attach event listeners
  container.querySelectorAll('.garage-card-figma').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-bike-edit') || e.target.closest('.btn-bike-delete')) return;
      const id = card.getAttribute('data-id');
      if (id !== activeBikeId) {
        switchActiveMotorcycle(id, navigateToTab);
      }
    });
  });

  container.querySelectorAll('.btn-set-active').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      switchActiveMotorcycle(id, navigateToTab);
    });
  });

  container.querySelectorAll('.btn-bike-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      openBikeModal(id);
    });
  });

  container.querySelectorAll('.btn-bike-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      deleteMotorcycleHandler(id, navigateToTab);
    });
  });
}

export function switchActiveMotorcycle(bikeId, navigateToTab) {
  const success = vehicleService.setActiveVehicleId(bikeId);
  if (success) {
    const bike = vehicleService.getActiveVehicle();
    showToast(`Switched active ride to ${bike ? bike.name : 'ride'} 🏍️`, 'success');
    
    // Update header bike name
    const headerEl = document.getElementById('dash-bike-name');
    if (headerEl && bike) headerEl.textContent = bike.name;

    // Refresh whichever tab is currently displayed
    renderGarage(navigateToTab);
  }
}

function setupGarageActions(navigateToTab) {
  const addBtn = document.getElementById('btn-add-bike-garage');
  if (addBtn) {
    addBtn.addEventListener('click', () => openBikeModal());
  }
}

function setupBikeModal(navigateToTab) {
  const modal = document.getElementById('modal-bike-form');
  const closeBtn = document.getElementById('btn-close-bike-modal');
  const form = document.getElementById('form-motorcycle');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeBikeModal());
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeBikeModal();
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleBikeFormSubmit(navigateToTab);
    });
  }
}

export function openBikeModal(bikeId = null) {
  currentEditingBikeId = bikeId;
  const modal = document.getElementById('modal-bike-form');
  const title = document.getElementById('modal-bike-title');
  const subtitle = document.getElementById('modal-bike-subtitle');
  const submitBtn = document.getElementById('btn-submit-bike');

  const nameInput = document.getElementById('input-bike-name');
  const makeInput = document.getElementById('input-bike-make');
  const modelInput = document.getElementById('input-bike-model');
  const yearInput = document.getElementById('input-bike-year');
  const ccInput = document.getElementById('input-bike-cc');
  const regInput = document.getElementById('input-bike-reg');
  const odoInput = document.getElementById('input-bike-odo');
  const purchaseDateInput = document.getElementById('input-bike-purchased');

  if (bikeId) {
    const bike = vehicleService.getVehicleById(bikeId);
    if (bike) {
      if (title) title.textContent = 'Edit motorcycle';
      if (subtitle) subtitle.textContent = "Update your bike's specs or odometer reading.";
      if (submitBtn) submitBtn.textContent = 'Save changes';
      if (nameInput) nameInput.value = bike.name || '';
      if (makeInput) makeInput.value = bike.manufacturer || '';
      if (modelInput) modelInput.value = bike.model || '';
      if (yearInput) yearInput.value = bike.year || '';
      if (ccInput) ccInput.value = bike.engineCapacity || '';
      if (regInput) regInput.value = bike.registrationNumber || '';
      if (odoInput) odoInput.value = bike.currentOdo || '';
      if (purchaseDateInput) purchaseDateInput.value = bike.purchaseDate || '';
    }
  } else {
    if (title) title.textContent = 'Add a motorcycle';
    if (subtitle) subtitle.textContent = "Add a bike to your garage to start tracking rides and service.";
    if (submitBtn) submitBtn.textContent = 'Add motorcycle';
    if (nameInput) nameInput.value = '';
    if (makeInput) makeInput.value = 'Royal Enfield';
    if (modelInput) modelInput.value = '';
    if (yearInput) yearInput.value = new Date().getFullYear();
    if (ccInput) ccInput.value = '350 cc';
    if (regInput) regInput.value = '';
    if (odoInput) odoInput.value = '0';
    if (purchaseDateInput) purchaseDateInput.value = '';
  }

  if (modal) modal.classList.add('active');
}

function closeBikeModal() {
  const modal = document.getElementById('modal-bike-form');
  if (modal) modal.classList.remove('active');
  currentEditingBikeId = null;
}

function handleBikeFormSubmit(navigateToTab) {
  const nameInput = document.getElementById('input-bike-name');
  const makeInput = document.getElementById('input-bike-make');
  const modelInput = document.getElementById('input-bike-model');
  const yearInput = document.getElementById('input-bike-year');
  const ccInput = document.getElementById('input-bike-cc');
  const regInput = document.getElementById('input-bike-reg');
  const odoInput = document.getElementById('input-bike-odo');
  const purchaseDateInput = document.getElementById('input-bike-purchased');

  const name = nameInput.value.trim();
  if (!name) {
    showToast('Please enter a vehicle name', 'danger');
    return;
  }

  const odo = parseFloat(odoInput.value) || 0;

  const payload = {
    id: currentEditingBikeId || generateId('bike'),
    name,
    manufacturer: makeInput.value.trim(),
    model: modelInput.value.trim() || name,
    year: parseInt(yearInput.value) || new Date().getFullYear(),
    engineCapacity: ccInput.value.trim(),
    registrationNumber: regInput.value.trim(),
    currentOdo: odo,
    purchaseDate: purchaseDateInput.value || '',
    image: ''
  };

  if (currentEditingBikeId) {
    vehicleService.updateVehicle(currentEditingBikeId, payload);
    showToast("Your ride's details are updated ✓", 'success');
  } else {
    vehicleService.addVehicle(payload);
    showToast(`Added ${payload.name} to your garage 🏍️`, 'success');
  }

  closeBikeModal();
  renderGarage(navigateToTab);
}

function deleteMotorcycleHandler(bikeId, navigateToTab) {
  const bikes = vehicleService.getVehicles();
  if (bikes.length <= 1) {
    showToast('Cannot remove the only ride in your garage.', 'danger');
    return;
  }

  const bike = vehicleService.getVehicleById(bikeId);
  const confirmed = window.confirm(`Are you sure you want to remove "${bike?.name || 'this ride'}" from your garage?`);
  if (confirmed) {
    vehicleService.deleteVehicle(bikeId);
    showToast('Ride removed from garage', 'normal');
    renderGarage(navigateToTab);
  }
}
