/**
 * Garage Module
 * Manage multiple motorcycles, active bike switching, bike CRUD, and garage statistics.
 */

import { storage } from './storage.js';
import { vehicleService } from './services/vehicles.js';
import { maintenanceService } from './services/maintenance.js';
import { serviceHistoryService } from './services/serviceHistory.js';
import { authService } from './services/auth.js';
import { aiBikeService } from './services/aiBike.js';
import { generateId, formatNumber, formatCurrency, formatDate, showToast } from './utils.js';

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
    <div class="garage-showcase-grid">
      ${bikes.map(bike => {
        const isActive = bike.id === activeBikeId;
        const bikeMaint = allMaintenance.filter(m => m.bikeId === bike.id);
        const currentOdo = Number(bike.currentMileage ?? bike.currentOdo) || 0;

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
        const brandName = (bike.brandId || bike.manufacturer || 'Royal Enfield')
          .split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const modelName = bike.nickname || bike.model || bike.name;
        const modelYear = bike.modelYear || bike.year || 2023;
        const regNumber = bike.registrationNumber || 'WB-02-AK-1234';
        const ccVal = bike.displacementCc ? `${bike.displacementCc} cc` : (bike.engineCapacity || (bike.name.includes('350') ? '349 cc' : (bike.name.includes('390') ? '373 cc' : '350 cc')));
        const variant = bike.variant || 'Standard Edition';

        return `
          <div class="garage-machine-card ${isActive ? 'is-active-bike' : ''}" data-id="${bike.id}">
            <div class="garage-machine-hero-media">
              <img src="${bikeImg}" alt="${modelName}" class="garage-machine-img" />
              <div class="garage-machine-badge-top ${isActive ? 'active' : 'standby'}">
                ${isActive ? '● ACTIVE MACHINE' : 'STANDBY'}
              </div>
            </div>

            <div class="garage-machine-details">
              <div>
                <div class="garage-brand-tag">${brandName}</div>
                <div class="garage-model-name">${modelName}</div>
                <div class="garage-spec-subtext">${modelYear} • ${variant} • ${ccVal} • ${regNumber}</div>

                <div class="garage-odo-row">
                  <div>
                    <span style="font-size: 0.68rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.08em; display: block;">Total Distance</span>
                    <span class="garage-odo-num tabular-nums">${formatNumber(currentOdo)} <small>KM</small></span>
                  </div>
                  <div style="text-align: right;">
                    <span style="font-size: 0.68rem; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.08em; display: block;">Next Service</span>
                    <span style="font-size: 0.95rem; font-weight: 800;" class="${serviceColorClass}">${remKmText}</span>
                  </div>
                </div>
              </div>

              <div class="garage-actions-cluster">
                <button class="btn-cockpit-primary btn-bike-profile" data-id="${bike.id}">
                  <span>View Machine →</span>
                </button>
                ${!isActive ? `
                  <button class="btn-cockpit-secondary btn-set-active" data-id="${bike.id}">
                    <span>Set as Active</span>
                  </button>
                ` : `
                  <span style="font-size: 0.8rem; color: #10B981; font-weight: 700; display: inline-flex; align-items: center; gap: 4px; padding: 6px 10px;">
                    <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:#10B981;"></span>
                    Active in Dashboard
                  </span>
                `}
                <button class="btn-cockpit-outline btn-bike-edit" data-id="${bike.id}">
                  <span>Edit Specs</span>
                </button>
                ${bikes.length > 1 ? `
                  <button class="btn-cockpit-outline btn-bike-delete" data-id="${bike.id}" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.25);">
                    <span>Remove</span>
                  </button>
                ` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  // Attach event listeners
  container.querySelectorAll('.garage-machine-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-bike-edit') || e.target.closest('.btn-bike-delete') || e.target.closest('.btn-bike-profile') || e.target.closest('.btn-set-active')) return;
      const id = card.getAttribute('data-id');
      openBikeProfileModal(id, navigateToTab);
    });
  });

  container.querySelectorAll('.btn-bike-profile').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      openBikeProfileModal(id, navigateToTab);
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
    showToast(`Switched active machine to ${bike ? bike.name : 'selected ride'}`, 'success');
    
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

  // --- AI Bike Identification Flow Wires ---
  const searchInput = document.getElementById('input-ai-bike-query');
  const identifyBtn = document.getElementById('btn-ai-identify');
  const searchAgainBtn = document.getElementById('btn-ai-search-again');
  const toggleManualBtn = document.getElementById('btn-toggle-manual-entry');
  const cancelManualBtn = document.getElementById('btn-cancel-manual');
  const confirmBikeBtn = document.getElementById('btn-ai-confirm-bike');
  const chipsContainer = document.getElementById('ai-bike-chips');

  const runAiSearch = async (queryText) => {
    const q = (queryText || searchInput?.value || '').trim();
    if (!q) {
      showToast('Please enter your motorcycle model', 'warning');
      return;
    }

    const searchView = document.getElementById('ai-bike-search-view');
    const loadingView = document.getElementById('ai-bike-loading-view');
    const confirmView = document.getElementById('ai-bike-confirm-view');
    const manualForm = document.getElementById('form-motorcycle');

    if (searchView) searchView.style.display = 'none';
    if (confirmView) confirmView.style.display = 'none';
    if (manualForm) manualForm.style.display = 'none';
    if (loadingView) loadingView.style.display = 'block';

    try {
      const result = await aiBikeService.identifyBike(q);
      const bike = result.bikeModel;

      // Populate Confirmation View
      const brandEl = document.getElementById('ai-confirm-brand');
      const modelEl = document.getElementById('ai-confirm-model');
      const yearEl = document.getElementById('ai-confirm-year');
      const catEl = document.getElementById('ai-confirm-category');
      const badgeEl = document.getElementById('ai-confirm-badge');
      const tagEl = document.getElementById('ai-confirm-tag');

      const ccEl = document.getElementById('ai-confirm-cc');
      const coolEl = document.getElementById('ai-confirm-cooling');
      const powerEl = document.getElementById('ai-confirm-power');
      const tankEl = document.getElementById('ai-confirm-tank');

      const nickInput = document.getElementById('ai-confirm-nickname');
      const odoInput = document.getElementById('ai-confirm-odo');

      if (brandEl) brandEl.textContent = bike.brand || 'Motorcycle';
      if (modelEl) modelEl.textContent = bike.model || 'Standard';
      if (yearEl) yearEl.textContent = bike.year || new Date().getFullYear();
      if (catEl) catEl.textContent = bike.category || 'Motorcycle';

      if (badgeEl) {
        if (result.isExistingCatalogueItem) {
          badgeEl.textContent = '● MASTER CATALOGUE MATCH';
          badgeEl.style.color = '#3B82F6';
        } else {
          badgeEl.textContent = '● MOTORCYCLE IDENTIFIED';
          badgeEl.style.color = '#10B981';
        }
      }

      if (tagEl) {
        tagEl.textContent = result.isExistingCatalogueItem ? 'EXISTING SPEC' : 'NEW AI ENRICHMENT';
      }

      if (ccEl) ccEl.textContent = bike.engine?.displacement || '—';
      if (coolEl) coolEl.textContent = bike.engine?.cooling || '—';
      if (powerEl) powerEl.textContent = bike.specifications?.engine?.power || '—';
      if (tankEl) tankEl.textContent = bike.specifications?.capacity?.fuelTank || '—';

      if (nickInput) nickInput.value = `${bike.brand} ${bike.model}`;
      if (odoInput && !odoInput.value) odoInput.value = '0';

      if (loadingView) loadingView.style.display = 'none';
      if (confirmView) confirmView.style.display = 'block';
    } catch (err) {
      if (loadingView) loadingView.style.display = 'none';
      if (searchView) searchView.style.display = 'block';
      showToast(err.message || 'Could not identify motorcycle', 'danger');
    }
  };

  if (identifyBtn) {
    identifyBtn.addEventListener('click', () => runAiSearch());
  }

  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runAiSearch();
      }
    });
  }

  if (chipsContainer) {
    chipsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-query]');
      if (btn) {
        const query = btn.getAttribute('data-query');
        if (searchInput) searchInput.value = query;
        runAiSearch(query);
      }
    });
  }

  if (searchAgainBtn) {
    searchAgainBtn.addEventListener('click', () => {
      const searchView = document.getElementById('ai-bike-search-view');
      const confirmView = document.getElementById('ai-bike-confirm-view');
      if (confirmView) confirmView.style.display = 'none';
      if (searchView) {
        searchView.style.display = 'block';
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
      }
    });
  }

  if (toggleManualBtn) {
    toggleManualBtn.addEventListener('click', () => {
      const searchView = document.getElementById('ai-bike-search-view');
      const manualForm = document.getElementById('form-motorcycle');
      if (searchView) searchView.style.display = 'none';
      if (manualForm) manualForm.style.display = 'block';
    });
  }

  if (cancelManualBtn) {
    cancelManualBtn.addEventListener('click', () => {
      const searchView = document.getElementById('ai-bike-search-view');
      const manualForm = document.getElementById('form-motorcycle');
      if (manualForm) manualForm.style.display = 'none';
      if (searchView) searchView.style.display = 'block';
    });
  }

  if (confirmBikeBtn) {
    confirmBikeBtn.addEventListener('click', async () => {
      const identified = aiBikeService.getLastIdentified();
      if (!identified || !identified.id) {
        showToast('No motorcycle identified to confirm', 'danger');
        return;
      }

      const nickInput = document.getElementById('ai-confirm-nickname');
      const odoInput = document.getElementById('ai-confirm-odo');
      const regInput = document.getElementById('ai-confirm-reg');
      const purchaseInput = document.getElementById('ai-confirm-purchased');

      confirmBikeBtn.disabled = true;
      confirmBikeBtn.textContent = 'Adding to garage...';

      try {
        const vehicle = await aiBikeService.confirmAndAddUserBike({
          bikeModelId: identified.id,
          nickname: nickInput?.value.trim() || `${identified.brand} ${identified.model}`,
          currentOdometer: Number(odoInput?.value) || 0,
          registrationNumber: regInput?.value.trim() || '',
          purchaseDate: purchaseInput?.value || ''
        });

        closeBikeModal();
        renderGarage(navigateToTab);
        showToast(`${vehicle.name} registered in your garage!`, 'success');
      } catch (err) {
        showToast(err.message || 'Failed to add motorcycle to garage', 'danger');
      } finally {
        confirmBikeBtn.disabled = false;
        confirmBikeBtn.textContent = 'Confirm Bike & Add to Garage';
      }
    });
  }
}

export function openBikeModal(bikeId = null) {
  currentEditingBikeId = bikeId;
  const modal = document.getElementById('modal-bike-form');
  const title = document.getElementById('modal-bike-title');
  const subtitle = document.getElementById('modal-bike-subtitle');

  const searchView = document.getElementById('ai-bike-search-view');
  const loadingView = document.getElementById('ai-bike-loading-view');
  const confirmView = document.getElementById('ai-bike-confirm-view');
  const manualForm = document.getElementById('form-motorcycle');
  const searchInput = document.getElementById('input-ai-bike-query');

  if (loadingView) loadingView.style.display = 'none';
  if (confirmView) confirmView.style.display = 'none';

  if (bikeId) {
    // Edit Mode: show manual form
    if (searchView) searchView.style.display = 'none';
    if (manualForm) manualForm.style.display = 'block';

    const bike = vehicleService.getVehicleById(bikeId);
    if (bike) {
      if (title) title.textContent = 'Edit motorcycle';
      if (subtitle) subtitle.textContent = "Update your bike's specs or odometer reading.";
      const submitBtn = document.getElementById('btn-submit-bike');
      if (submitBtn) submitBtn.textContent = 'Save changes';
      document.getElementById('input-bike-name').value = bike.name || '';
      document.getElementById('input-bike-make').value = bike.manufacturer || '';
      document.getElementById('input-bike-model').value = bike.model || '';
      document.getElementById('input-bike-year').value = bike.year || '';
      document.getElementById('input-bike-cc').value = bike.engineCapacity || '';
      document.getElementById('input-bike-reg').value = bike.registrationNumber || '';
      document.getElementById('input-bike-odo').value = bike.currentOdo || '';
      document.getElementById('input-bike-purchased').value = bike.purchaseDate || '';
    }
  } else {
    // Add Mode: show AI Search View
    if (manualForm) manualForm.style.display = 'none';
    if (searchView) searchView.style.display = 'block';
    if (title) title.textContent = 'Add Your Bike';
    if (subtitle) subtitle.textContent = "Enter your motorcycle model to identify it and load catalogue specifications.";
    if (searchInput) {
      searchInput.value = '';
      setTimeout(() => searchInput.focus(), 100);
    }
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
    showToast("Your ride's details are updated", 'success');
  } else {
    vehicleService.addVehicle(payload);
    showToast(`Added ${payload.name} to your garage`, 'success');
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

/**
 * Open the dedicated Motorcycle Digital Identity Profile Modal
 */
export function openBikeProfileModal(bikeId, navigateToTab) {
  const bike = vehicleService.getVehicleById(bikeId);
  if (!bike) return;

  const modal = document.getElementById('modal-bike-profile');
  if (!modal) return;

  const activeBikeId = vehicleService.getActiveVehicleId();
  const isActive = bike.id === activeBikeId;
  const currentOdo = Number(bike.currentMileage ?? bike.currentOdo) || 0;
  const allRides = serviceHistoryService.getAllRides();
  const bikeRides = allRides.filter(r => r.bikeId === bike.id);
  const bikeMaint = maintenanceService.getMaintenance(bike.id);

  // Calculate next service
  let minRemainingKm = Infinity;
  let hasOverdue = false;
  bikeMaint.forEach(m => {
    const remKm = Number(m.nextServiceKm) - currentOdo;
    if (remKm < minRemainingKm) minRemainingKm = remKm;
    if (remKm <= 0) hasOverdue = true;
  });

  let serviceStatusText = 'All caught up';
  if (hasOverdue) {
    serviceStatusText = 'Overdue for care';
  } else if (isFinite(minRemainingKm) && minRemainingKm > 0) {
    serviceStatusText = `Due in ${formatNumber(minRemainingKm)} km`;
  }

  // Populate hero & header
  const imgEl = document.getElementById('profile-bike-img');
  const titleEl = document.getElementById('profile-bike-title');
  const nicknameEl = document.getElementById('profile-bike-nickname');
  const statusBadgeEl = document.getElementById('profile-bike-status-badge');
  const yearBadgeEl = document.getElementById('profile-bike-year-badge');

  if (imgEl) imgEl.src = vehicleService.getVehicleImage(bike);
  if (titleEl) titleEl.textContent = bike.name;
  if (nicknameEl) nicknameEl.textContent = `"${bike.nickname || bike.name}" · ${bike.registrationNumber || 'No plate'}`;
  
  if (statusBadgeEl) {
    statusBadgeEl.textContent = isActive ? 'ACTIVE RIDE' : 'READY';
    statusBadgeEl.style.color = isActive ? '#10B981' : '#94A3B8';
  }
  if (yearBadgeEl) yearBadgeEl.textContent = `${bike.year || 2023} MODEL`;

  // Populate quick numbers
  const odoEl = document.getElementById('profile-bike-odo');
  const serviceEl = document.getElementById('profile-bike-service-status');
  const tripsEl = document.getElementById('profile-bike-trips-count');

  if (odoEl) odoEl.innerHTML = `${formatNumber(currentOdo)} <small style="font-size: 0.75rem; color: #94A3B8;">km</small>`;
  if (serviceEl) {
    serviceEl.textContent = serviceStatusText;
    serviceEl.style.color = hasOverdue ? '#EF4444' : (minRemainingKm <= 800 ? '#F59E0B' : '#10B981');
  }
  if (tripsEl) tripsEl.textContent = bikeRides.length;

  // Technical Specs
  const specMake = document.getElementById('profile-spec-make');
  const specModel = document.getElementById('profile-spec-model');
  const specVariant = document.getElementById('profile-spec-variant');
  const specCc = document.getElementById('profile-spec-cc');
  const specPurchased = document.getElementById('profile-spec-purchased');
  const specReg = document.getElementById('profile-spec-reg');

  if (specMake) specMake.textContent = bike.manufacturer || 'Royal Enfield';
  if (specModel) specModel.textContent = bike.model || bike.name;
  if (specVariant) specVariant.textContent = bike.variant || 'Standard';
  const ccVal = bike.displacementCc ? `${bike.displacementCc} cc` : (bike.engineCapacity || (bike.name.includes('350') ? '349 cc' : (bike.name.includes('390') ? '373 cc' : '350 cc')));
  if (specCc) specCc.textContent = ccVal;
  if (specPurchased) specPurchased.textContent = bike.purchaseDate ? formatDate(bike.purchaseDate) : 'Not recorded';
  if (specReg) specReg.textContent = bike.registrationNumber || 'Not registered';

  // Wire Close Button
  const closeBtn = document.getElementById('btn-close-bike-profile');
  if (closeBtn) {
    closeBtn.onclick = () => modal.classList.remove('active');
  }

  modal.onclick = (e) => {
    if (e.target === modal) modal.classList.remove('active');
  };

  // Wire Set as Active button
  const setActiveBtn = document.getElementById('btn-profile-set-active');
  if (setActiveBtn) {
    setActiveBtn.textContent = isActive ? 'Active Machine' : 'Set as Active Machine';
    setActiveBtn.disabled = isActive;
    setActiveBtn.onclick = () => {
      switchActiveMotorcycle(bike.id, navigateToTab);
      modal.classList.remove('active');
    };
  }

  // Wire Edit Specs button
  const editSpecsBtn = document.getElementById('btn-profile-edit-specs');
  if (editSpecsBtn) {
    editSpecsBtn.onclick = () => {
      modal.classList.remove('active');
      openBikeModal(bike.id);
    };
  }

  // Wire Change Photo button with 5MB validation
  const changePhotoBtn = document.getElementById('btn-profile-change-photo');
  const fileInput = document.getElementById('input-profile-photo-file');
  if (changePhotoBtn && fileInput) {
    changePhotoBtn.onclick = () => fileInput.click();
    fileInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.size > 5 * 1024 * 1024) {
        showToast('Image size exceeds 5MB limit', 'danger');
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64Url = event.target.result;
        vehicleService.updateVehicle(bike.id, {
          customImageUrl: base64Url,
          imageUrl: base64Url,
          image: base64Url
        });
        if (imgEl) imgEl.src = base64Url;
        showToast('Motorcycle photo updated', 'success');
        renderGarage(navigateToTab);
      };
      reader.readAsDataURL(file);
    };
  }

  modal.classList.add('active');
}
