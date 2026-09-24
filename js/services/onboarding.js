/**
 * Onboarding Flow State Architecture
 * Manages the mandatory initial setup when an authenticated user has 0 vehicles:
 * 1. Add Your Ride (Vehicle specs + current odometer)
 * 2. Maintenance Baseline Setup (with explicit per-field skip capability)
 * 3. Dashboard Unlock
 */

import { authService } from './auth.js';
import { vehicleService } from './vehicles.js';
import { maintenanceService } from './maintenance.js';
import { showToast, formatNumber } from '../utils.js';

class OnboardingService {
  constructor() {
    this._step = 1;
    this._vehicleDraft = null;
    this._maintenanceDraft = {};
  }

  /**
   * Check if onboarding is required for current user
   * @param {string} [userId]
   * @returns {boolean}
   */
  isOnboardingRequired(userId = authService.getUserId()) {
    if (!authService.isAuthenticated()) return false;
    const vehicles = vehicleService.getVehicles(userId);
    return vehicles.length === 0;
  }

  /**
   * Launch onboarding modal flow
   */
  startOnboarding() {
    this._step = 1;
    this._vehicleDraft = null;
    this._maintenanceDraft = {
      fullService: { value: null, skipped: false },
      engineOil: { value: null, skipped: false },
      chain: { value: null, skipped: false },
      airFilter: { value: null, skipped: true }, // Default skippable
      suspension: { value: null, skipped: true }  // Default skippable
    };

    const modal = document.getElementById('modal-onboarding');
    if (!modal) return;

    this._renderStep();
    modal.classList.add('active');
  }

  /**
   * Close onboarding modal
   */
  closeOnboarding() {
    const modal = document.getElementById('modal-onboarding');
    if (modal) modal.classList.remove('active');
  }

  /**
   * Initialize DOM event handlers for onboarding wizard
   */
  init(navigateToTab) {
    this._navigateToTab = navigateToTab;

    const modal = document.getElementById('modal-onboarding');
    if (!modal) return;

    // Prevent closing by clicking outside if onboarding is mandatory
    modal.addEventListener('click', (e) => {
      if (e.target === modal && !this.isOnboardingRequired()) {
        this.closeOnboarding();
      }
    });

    // Wire Step 1 Brand Selector Tiles
    const brandTiles = document.querySelectorAll('.onboarding-brand-tile');
    const brandHiddenInput = document.getElementById('ob-input-make');
    const modelInput = document.getElementById('ob-input-model');
    brandTiles.forEach(tile => {
      tile.addEventListener('click', () => {
        brandTiles.forEach(t => t.classList.remove('selected'));
        tile.classList.add('selected');
        const selectedBrand = tile.getAttribute('data-brand');
        if (brandHiddenInput) brandHiddenInput.value = selectedBrand;
        if (modelInput) {
          if (selectedBrand === 'Royal Enfield') modelInput.value = 'Hunter 350';
          else if (selectedBrand === 'Honda') modelInput.value = 'CB350';
          else if (selectedBrand === 'Jawa') modelInput.value = '42 Bobber';
        }
      });
    });

    // Wire Step 1 Photo Upload Picker with 5MB validation
    const pickPhotoBtn = document.getElementById('btn-ob-pick-photo');
    const photoInput = document.getElementById('ob-file-input');
    const photoPreview = document.getElementById('ob-photo-preview');
    const photoNameLbl = document.getElementById('ob-file-name-lbl');

    if (pickPhotoBtn && photoInput) {
      pickPhotoBtn.addEventListener('click', () => photoInput.click());
      photoInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
          showToast('Image size exceeds 5MB limit', 'danger');
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          this._uploadedPhotoUrl = event.target.result;
          if (photoPreview) photoPreview.src = event.target.result;
          if (photoNameLbl) photoNameLbl.textContent = file.name;
          showToast('Bike picture loaded', 'success');
        };
        reader.readAsDataURL(file);
      });
    }

    // Step 1: Form submission -> Go to Step 2
    const formStep1 = document.getElementById('onboarding-form-step1');
    if (formStep1) {
      formStep1.addEventListener('submit', (e) => {
        e.preventDefault();
        const make = document.getElementById('ob-input-make')?.value.trim() || 'Royal Enfield';
        const model = document.getElementById('ob-input-model')?.value.trim() || 'Hunter 350';
        const variant = document.getElementById('ob-input-variant')?.value.trim() || '';
        const nickname = document.getElementById('ob-input-nickname')?.value.trim() || '';
        const year = Number(document.getElementById('ob-input-year')?.value) || 2023;
        const reg = document.getElementById('ob-input-reg')?.value.trim() || '';
        const currentOdo = Number(document.getElementById('ob-input-odo')?.value) || 0;
        const purchased = document.getElementById('ob-input-purchased')?.value || '';

        const defaultImg = model.toLowerCase().includes('duke') ? 'assets/duke-390.jpg' : 'assets/hunter-350.jpg';

        this._vehicleDraft = {
          manufacturer: make,
          model: model,
          variant: variant,
          name: nickname || `${make} ${model}`,
          nickname: nickname,
          year: year,
          registrationNumber: reg,
          currentMileage: currentOdo,
          purchaseDate: purchased,
          imageUrl: this._uploadedPhotoUrl || defaultImg,
          customImageUrl: this._uploadedPhotoUrl || null
        };

        this._step = 2;
        this._renderStep();
      });
    }

    // Step 2: Back button -> Return to Step 1
    const btnBack = document.getElementById('ob-btn-back-step1');
    if (btnBack) {
      btnBack.addEventListener('click', () => {
        this._step = 1;
        this._renderStep();
      });
    }

    // Step 2: Form submission -> Finish & unlock dashboard
    const formStep2 = document.getElementById('onboarding-form-step2');
    if (formStep2) {
      formStep2.addEventListener('submit', (e) => {
        e.preventDefault();
        this._completeOnboarding();
      });
    }

    // Wire individual "Skip" buttons for each maintenance item
    this._wireSkipButtons();
  }

  _wireSkipButtons() {
    const items = ['fullService', 'engineOil', 'chain', 'airFilter', 'suspension'];
    items.forEach(item => {
      const skipBtn = document.getElementById(`ob-skip-${item}`);
      const input = document.getElementById(`ob-input-${item}`);
      const statusBadge = document.getElementById(`ob-badge-${item}`);

      if (skipBtn && input) {
        skipBtn.addEventListener('click', () => {
          const isSkipped = input.disabled;
          if (!isSkipped) {
            // Mark as skipped
            input.disabled = true;
            input.dataset.oldValue = input.value;
            input.value = '';
            input.placeholder = 'Skipped (no record created)';
            skipBtn.textContent = 'Undo skip';
            skipBtn.classList.add('active');
            if (statusBadge) {
              statusBadge.textContent = 'Skipped';
              statusBadge.style.display = 'inline-block';
            }
          } else {
            // Un-skip
            input.disabled = false;
            input.placeholder = 'e.g. 12000 km';
            input.value = input.dataset.oldValue || '';
            skipBtn.textContent = 'Skip';
            skipBtn.classList.remove('active');
            if (statusBadge) {
              statusBadge.style.display = 'none';
            }
          }
        });
      }
    });
  }

  _renderStep() {
    const step1El = document.getElementById('onboarding-step-1');
    const step2El = document.getElementById('onboarding-step-2');
    const stepIndicator = document.getElementById('onboarding-step-indicator');
    const progressFill = document.getElementById('onboarding-progress-fill');

    if (this._step === 1) {
      if (step1El) step1El.style.display = 'block';
      if (step2El) step2El.style.display = 'none';
      if (stepIndicator) stepIndicator.textContent = 'Step 1 of 2: Add your ride';
      if (progressFill) progressFill.style.width = '50%';
    } else {
      if (step1El) step1El.style.display = 'none';
      if (step2El) step2El.style.display = 'block';
      if (stepIndicator) stepIndicator.textContent = 'Step 2 of 2: Maintenance history';
      if (progressFill) progressFill.style.width = '100%';

      // Pre-fill bike name in Step 2 subtitle
      const bikeTitleEl = document.getElementById('ob-step2-bike-name');
      if (bikeTitleEl && this._vehicleDraft) {
        bikeTitleEl.textContent = `${this._vehicleDraft.manufacturer} ${this._vehicleDraft.model} (${formatNumber(this._vehicleDraft.currentMileage)} km)`;
      }
    }
  }

  _completeOnboarding() {
    const userId = authService.getUserId() || 'user_demo_rajarshee';

    // 1. Create and save vehicle
    const vehicle = vehicleService.addVehicle({
      ...this._vehicleDraft,
      userId: userId
    }, userId);

    vehicleService.setActiveVehicleId(vehicle.id);

    // 2. Process skippable maintenance inputs
    const currentOdo = Number(this._vehicleDraft.currentMileage) || 0;
    const maintenanceConfig = [
      { key: 'fullService', type: 'Full General Service', defaultInterval: 10000 },
      { key: 'engineOil', type: 'Engine Oil', defaultInterval: 5000 },
      { key: 'chain', type: 'Chain Service', defaultInterval: 1000 },
      { key: 'airFilter', type: 'Air Filter', defaultInterval: 10000 },
      { key: 'suspension', type: 'Brake & Suspension Check', defaultInterval: 10000 }
    ];

    let recordedCount = 0;
    maintenanceConfig.forEach(cfg => {
      const input = document.getElementById(`ob-input-${cfg.key}`);
      const isSkipped = input ? input.disabled : false;
      const val = input ? input.value.trim() : '';

      if (!isSkipped && val !== '') {
        const lastKm = Number(val);
        if (!isNaN(lastKm) && lastKm >= 0) {
          // Log historical baseline record
          maintenanceService.addMaintenanceRecord({
            vehicleId: vehicle.id,
            userId: userId,
            serviceType: cfg.type,
            mileage: lastKm,
            serviceDate: new Date().toISOString().split('T')[0],
            notes: `Baseline service recorded during onboarding (${formatNumber(lastKm)} km)`
          }, userId);

          // Create schedule reminder
          maintenanceService.addMaintenanceScheduleItem({
            vehicleId: vehicle.id,
            bikeId: vehicle.id,
            userId: userId,
            type: cfg.type,
            lastServiceKm: lastKm,
            intervalKm: cfg.defaultInterval,
            nextServiceKm: lastKm + cfg.defaultInterval
          }, userId);

          recordedCount++;
        }
      }
    });

    // 3. Unlock dashboard
    this.closeOnboarding();
    showToast(`Welcome aboard! ${vehicle.name} is ready in your garage`, 'success');

    if (this._navigateToTab) {
      this._navigateToTab('dashboard');
    }
  }
}

export const onboardingService = new OnboardingService();
