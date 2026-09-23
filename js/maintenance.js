/**
 * Smart Maintenance Module
 * Features:
 * - Dual criteria checking (Odometer KM remaining & Calendar Days remaining)
 * - Urgency priority sorting (Overdue, Due within 7 days, Due within 500 km, Due within 30 days, Healthy)
 * - Completion archiving into Service History
 * - Auto-interval calculation for next cycle
 * - Dashboard Quick Action modal support
 * - Scoped to active motorcycle
 */

import { storage } from './storage.js';
import { vehicleService } from './services/vehicles.js';
import { maintenanceService } from './services/maintenance.js';
import { authService } from './services/auth.js';
import { generateId, formatNumber, formatDate, getTodayDateString, showToast } from './utils.js';

let currentEditingMaintId = null;

export function initMaintenanceModule(navigateToTab) {
  setupMaintenanceModal(navigateToTab);
  setupQuickServiceModal(navigateToTab);
}

/**
 * Calculates smart status for a maintenance record comparing against odometer and date
 */
export function calculateSmartStatus(record, currentOdo) {
  const nextKm = Number(record.nextServiceKm) || 0;
  const remainingKm = nextKm - currentOdo;

  let daysRemaining = null;
  if (record.nextServiceDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(record.nextServiceDate);
    targetDate.setHours(0, 0, 0, 0);
    const diffMs = targetDate - today;
    daysRemaining = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  // Friendly human title for common service types
  const friendlyTitles = {
    'Engine Oil': 'Oil change',
    'Engine Oil & Filter': 'Oil & filter change',
    'Oil Filter': 'Oil filter change',
    'Air Filter': 'Air filter check',
    'Brake Pads': 'Brake check',
    'Chain Service': 'Chain maintenance',
    'Tyres': 'Tire inspection',
    'Spark Plug': 'Spark plug check',
    'General Service': 'General service'
  };
  const humanTitle = friendlyTitles[record.type] || record.type;

  // Determine urgency category and natural human labels
  let priority = 5;
  let statusBadge = '';
  let statusText = '';
  let isOverdue = false;

  if (remainingKm <= 0 || (daysRemaining !== null && daysRemaining < 0)) {
    priority = 1;
    isOverdue = true;
    statusBadge = '<span class="badge badge-danger">Needs attention</span>';

    if (remainingKm <= 0 && daysRemaining !== null && daysRemaining < 0) {
      statusText = `Overdue by ${formatNumber(Math.abs(remainingKm))} km`;
    } else if (remainingKm <= 0) {
      statusText = `Overdue by ${formatNumber(Math.abs(remainingKm))} km`;
    } else {
      statusText = `Overdue by ${Math.abs(daysRemaining)} days`;
    }
  } else if (daysRemaining !== null && daysRemaining <= 7) {
    priority = 2;
    statusBadge = '<span class="badge badge-warning">Coming up</span>';
    statusText = daysRemaining === 0 ? 'Service due today' : `Due in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}`;
  } else if (remainingKm <= 500) {
    priority = 3;
    statusBadge = '<span class="badge badge-warning">Coming up</span>';
    statusText = `Due in about ${formatNumber(remainingKm)} km`;
  } else if (daysRemaining !== null && daysRemaining <= 30) {
    priority = 4;
    statusBadge = '<span class="badge badge-warning">Coming up</span>';
    statusText = `Due in ${daysRemaining} days (${formatNumber(remainingKm)} km)`;
  } else if (remainingKm <= 1000) {
    priority = 4;
    statusBadge = '<span class="badge badge-warning">Coming up</span>';
    statusText = `Due in about ${formatNumber(remainingKm)} km`;
  } else {
    priority = 5;
    statusBadge = '<span class="badge badge-success">All good</span>';
    statusText = `${formatNumber(remainingKm)} km to go`;
  }

  return {
    priority,
    statusBadge,
    statusText,
    humanTitle,
    remainingKm,
    daysRemaining,
    isOverdue
  };
}

let activeMaintFilter = 'upcoming';

export function renderMaintenance(navigateToTab) {
  const container = document.getElementById('maint-tasks-container');
  if (!container) return;

  const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();
  const records = activeBike ? maintenanceService.getMaintenance(activeBike.id) : [];
  const currentOdo = Number(activeBike?.currentMileage ?? activeBike?.currentOdo) || 0;
  const history = activeBike ? maintenanceService.getMaintenanceHistory(activeBike.id) : [];

  // Update subtitle
  const subEl = document.getElementById('maint-bike-subtitle');
  if (subEl) {
    subEl.textContent = `Scheduled maintenance for ${activeBike.name || 'Hunter 350'}`;
  }

  // Process smart statuses and sort by urgency
  const evaluatedRecords = records.map(r => {
    const status = calculateSmartStatus(r, currentOdo);
    return { ...r, ...status };
  });

  evaluatedRecords.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.remainingKm - b.remainingKm;
  });

  const upcomingList = evaluatedRecords.filter(r => !r.isOverdue);
  const overdueList = evaluatedRecords.filter(r => r.isOverdue);

  // Update counts on pill tabs
  const tabUpcoming = document.getElementById('tab-maint-upcoming');
  const tabOverdue = document.getElementById('tab-maint-overdue');
  const tabCompleted = document.getElementById('tab-maint-completed');

  if (tabUpcoming) tabUpcoming.textContent = `Upcoming (${upcomingList.length})`;
  if (tabOverdue) tabOverdue.textContent = `Overdue (${overdueList.length})`;
  if (tabCompleted) tabCompleted.textContent = `Completed (${history.length})`;

  // Wire pill tab buttons
  setupPillTabs(navigateToTab);

  const getTaskVisuals = (task) => {
    const type = (task.type || '').toLowerCase();
    if (type.includes('oil')) {
      return { icon: '🛢️', color: 'amber' };
    } else if (type.includes('chain')) {
      return { icon: '⛓️', color: 'blue' };
    } else if (type.includes('brake')) {
      return { icon: '🛑', color: 'blue' };
    } else if (type.includes('tyre') || type.includes('tire')) {
      return { icon: '🔘', color: 'green' };
    } else {
      return { icon: '🔧', color: 'blue' };
    }
  };

  if (activeMaintFilter === 'upcoming') {
    if (upcomingList.length === 0) {
      container.innerHTML = `
        <div style="background: #13161C; border: 1px solid #1E232E; border-radius: 16px; padding: 36px 20px; text-align: center; color: #64748B;">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">🎉</div>
          <div style="font-weight: 700; font-size: 1.15rem; color: #FFFFFF; margin-bottom: 4px;">Nothing coming up</div>
          <div style="font-size: 0.85rem; margin-bottom: 16px;">You're all caught up for now. We'll let you know when something needs care.</div>
          <button class="btn btn-primary btn-sm" id="btn-empty-add-maint" style="width: auto;">+ Plan service</button>
        </div>
      `;
      document.getElementById('btn-empty-add-maint')?.addEventListener('click', () => openMaintModal());
      return;
    }

    container.innerHTML = upcomingList.map(item => {
      const visuals = getTaskVisuals(item);
      const interval = Number(item.serviceIntervalKm || item.intervalKm) || 3000;
      const progressPercent = Math.min(100, Math.max(10, Math.round(((interval - Math.max(0, item.remainingKm)) / interval) * 100)));
      let colorClass = visuals.color;
      if (item.remainingKm <= 500) colorClass = 'amber';

      return `
        <div class="task-card-figma" data-id="${item.id}">
          <div class="task-header-row">
            <div class="task-left-wrap">
              <div class="task-icon-box ${colorClass}">
                <span>${visuals.icon}</span>
              </div>
              <div>
                <div class="task-name">${item.humanTitle || item.type}</div>
                <div class="task-bike-name">${activeBike.name}</div>
              </div>
            </div>
            <div class="task-dist-wrap">
              <div class="task-dist-val ${colorClass}">${formatNumber(Math.max(0, item.remainingKm))} km</div>
              <div class="task-dist-lbl">away</div>
            </div>
          </div>

          <div class="task-progress-bar">
            <div class="task-progress-fill ${colorClass}" style="width: ${progressPercent}%;"></div>
          </div>

          <div class="task-footer-row">
            <span class="task-due-text">Due in ${formatNumber(Math.max(0, item.remainingKm))} km · at ${formatNumber(item.nextServiceKm)} km</span>
            <div style="display: flex; gap: 8px;">
              <button class="btn-plan-service btn-maint-done" data-id="${item.id}" style="background: rgba(16, 185, 129, 0.15); color: #10B981; border-color: rgba(16, 185, 129, 0.3);">Mark done</button>
              <button class="btn-plan-service btn-maint-edit" data-id="${item.id}">Edit</button>
              <button class="btn-plan-service btn-maint-delete" data-id="${item.id}" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.3);">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } else if (activeMaintFilter === 'overdue') {
    if (overdueList.length === 0) {
      container.innerHTML = `
        <div style="background: #13161C; border: 1px solid #1E232E; border-radius: 16px; padding: 36px 20px; text-align: center; color: #64748B;">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">✨</div>
          <div style="font-weight: 700; font-size: 1.15rem; color: #FFFFFF; margin-bottom: 4px;">No overdue tasks</div>
          <div style="font-size: 0.85rem;">All scheduled maintenance for ${activeBike.name} is on track.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = overdueList.map(item => {
      const visuals = getTaskVisuals(item);
      return `
        <div class="task-card-figma" data-id="${item.id}" style="border-color: #EF4444;">
          <div class="task-header-row">
            <div class="task-left-wrap">
              <div class="task-icon-box red">
                <span>${visuals.icon}</span>
              </div>
              <div>
                <div class="task-name">${item.humanTitle || item.type}</div>
                <div class="task-bike-name">${activeBike.name}</div>
              </div>
            </div>
            <div class="task-dist-wrap">
              <div class="task-dist-val red">${formatNumber(Math.abs(item.remainingKm))} km</div>
              <div class="task-dist-lbl" style="color: #EF4444;">overdue</div>
            </div>
          </div>

          <div class="task-progress-bar">
            <div class="task-progress-fill red" style="width: 100%;"></div>
          </div>

          <div class="task-footer-row">
            <span class="task-due-text" style="color: #EF4444;">Overdue by ${formatNumber(Math.abs(item.remainingKm))} km · was due at ${formatNumber(item.nextServiceKm)} km</span>
            <div style="display: flex; gap: 8px;">
              <button class="btn-plan-service btn-maint-done" data-id="${item.id}" style="background: rgba(16, 185, 129, 0.15); color: #10B981; border-color: rgba(16, 185, 129, 0.3);">Mark done</button>
              <button class="btn-plan-service btn-maint-edit" data-id="${item.id}">Edit</button>
              <button class="btn-plan-service btn-maint-delete" data-id="${item.id}" style="color: #EF4444; border-color: rgba(239, 68, 68, 0.3);">Delete</button>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } else if (activeMaintFilter === 'completed') {
    if (history.length === 0) {
      container.innerHTML = `
        <div style="background: #13161C; border: 1px solid #1E232E; border-radius: 16px; padding: 36px 20px; text-align: center; color: #64748B;">
          <div style="font-size: 2.2rem; margin-bottom: 8px;">📋</div>
          <div style="font-weight: 700; font-size: 1.15rem; color: #FFFFFF; margin-bottom: 4px;">No completed services yet</div>
          <div style="font-size: 0.85rem;">When you mark a service as completed, it will be safely logged here.</div>
        </div>
      `;
      return;
    }

    container.innerHTML = history.map(item => {
      return `
        <div class="task-card-figma" style="border-color: #1E232E;">
          <div class="task-header-row">
            <div class="task-left-wrap">
              <div class="task-icon-box green">
                <span>✓</span>
              </div>
              <div>
                <div class="task-name">${item.type}</div>
                <div class="task-bike-name">${activeBike.name} · Completed at ${formatNumber(item.completedKm)} km</div>
              </div>
            </div>
            <div class="task-dist-wrap">
              <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10B981; font-weight: 700; padding: 4px 10px; border-radius: 999px;">✓ Done</span>
            </div>
          </div>

          <div class="task-footer-row" style="margin-top: 6px;">
            <span class="task-due-text">${formatDate(item.completedDate)}${item.notes ? ` · ${item.notes}` : ''}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // Attach card action listeners
  container.querySelectorAll('.btn-maint-edit').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      openMaintModal(id);
    });
  });

  container.querySelectorAll('.btn-maint-done').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      handleSmartMarkComplete(id, currentOdo, navigateToTab);
    });
  });

  container.querySelectorAll('.btn-maint-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-id');
      handleDeleteMaintenance(id, navigateToTab);
    });
  });
}

function setupPillTabs(navigateToTab) {
  const tabs = document.querySelectorAll('#maint-pill-tabs .pill-tab-btn');
  tabs.forEach(btn => {
    btn.onclick = () => {
      const filter = btn.getAttribute('data-maint-filter');
      if (filter && filter !== activeMaintFilter) {
        activeMaintFilter = filter;
        tabs.forEach(t => t.classList.toggle('active', t === btn));
        renderMaintenance(navigateToTab);
      }
    };
  });
}

/**
 * Render historical completed services for the bike
 */
export function renderServiceHistory(bikeId) {
  const container = document.getElementById('maintenance-history-list');
  if (!container) return;

  const history = maintenanceService.getMaintenanceHistory(bikeId);

  if (history.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 20px; color: var(--text-subtle); font-size: 0.85rem;">
        No completed service history recorded yet. Completed services will appear here.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${history.map(item => `
        <div class="card" style="padding: 12px 14px; display: flex; justify-content: space-between; align-items: center;">
          <div>
            <div style="font-weight: 700; font-size: 0.92rem; color: var(--text-main);">${item.type}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
              ${formatDate(item.completedDate)} · ${formatNumber(item.completedKm)} km
            </div>
            ${item.notes ? `<div style="font-size: 0.74rem; color: var(--text-subtle); margin-top: 2px;">${item.notes}</div>` : ''}
          </div>
          <div style="text-align: right;">
            <span class="badge badge-success">✓ Completed</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function setupMaintenanceModal(navigateToTab) {
  const modal = document.getElementById('modal-maint-form');
  const addBtn = document.getElementById('btn-add-maint-header');
  const closeBtn = document.getElementById('btn-close-maint-modal');
  const form = document.getElementById('form-maintenance');

  if (addBtn) {
    addBtn.addEventListener('click', () => openMaintModal());
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeMaintModal());
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeMaintModal();
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleMaintSubmit(navigateToTab);
    });
  }
}

export function openMaintModal(id = null) {
  currentEditingMaintId = id;
  const modal = document.getElementById('modal-maint-form');
  const title = document.getElementById('modal-maint-title');
  const typeSelect = document.getElementById('input-maint-type');
  const currentKmInput = document.getElementById('input-maint-current-km');
  const nextKmInput = document.getElementById('input-maint-next-km');
  const intervalKmInput = document.getElementById('input-maint-interval-km');
  const dateInput = document.getElementById('input-maint-date');
  const nextDateInput = document.getElementById('input-maint-next-date');
  const notesInput = document.getElementById('input-maint-notes');

  const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();
  const currentOdo = Number(activeBike?.currentMileage ?? activeBike?.currentOdo) || 0;

  const submitBtn = document.getElementById('btn-submit-maint');

  if (id) {
    const records = maintenanceService.getAllMaintenance();
    const record = records.find(m => m.id === id);
    if (record) {
      if (title) title.textContent = 'Edit service reminder';
      if (submitBtn) submitBtn.textContent = 'Save changes';
      if (typeSelect) typeSelect.value = record.type;
      if (currentKmInput) currentKmInput.value = record.lastServiceKm || record.currentKm || currentOdo;
      if (nextKmInput) nextKmInput.value = record.nextServiceKm || '';
      if (intervalKmInput) intervalKmInput.value = record.intervalKm || 3000;
      if (dateInput) dateInput.value = record.lastServiceDate || record.serviceDate || '';
      if (nextDateInput) nextDateInput.value = record.nextServiceDate || '';
      if (notesInput) notesInput.value = record.notes || '';
    }
  } else {
    if (title) title.textContent = 'Plan a service';
    if (submitBtn) submitBtn.textContent = 'Save service';
    if (typeSelect) typeSelect.value = 'Engine Oil';
    if (currentKmInput) currentKmInput.value = currentOdo > 0 ? currentOdo : '';
    if (intervalKmInput) intervalKmInput.value = '3000';
    if (nextKmInput) nextKmInput.value = currentOdo > 0 ? currentOdo + 3000 : 3000;
    if (dateInput) dateInput.value = getTodayDateString();

    // Default next date in ~3 months
    const threeMonths = new Date();
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    const yyyy = threeMonths.getFullYear();
    const mm = String(threeMonths.getMonth() + 1).padStart(2, '0');
    const dd = String(threeMonths.getDate()).padStart(2, '0');
    if (nextDateInput) nextDateInput.value = `${yyyy}-${mm}-${dd}`;

    if (notesInput) notesInput.value = '';
  }

  // Automatically update next KM when interval or current changes
  const updateNextKmHelper = () => {
    const c = parseFloat(currentKmInput.value) || 0;
    const inv = parseFloat(intervalKmInput.value) || 0;
    if (inv > 0 && !id) {
      nextKmInput.value = c + inv;
    }
  };
  intervalKmInput.oninput = updateNextKmHelper;
  currentKmInput.oninput = updateNextKmHelper;

  if (modal) modal.classList.add('active');
}

function closeMaintModal() {
  const modal = document.getElementById('modal-maint-form');
  if (modal) modal.classList.remove('active');
  currentEditingMaintId = null;
}

function handleMaintSubmit(navigateToTab) {
  const typeSelect = document.getElementById('input-maint-type');
  const currentKmInput = document.getElementById('input-maint-current-km');
  const nextKmInput = document.getElementById('input-maint-next-km');
  const intervalKmInput = document.getElementById('input-maint-interval-km');
  const dateInput = document.getElementById('input-maint-date');
  const nextDateInput = document.getElementById('input-maint-next-date');
  const notesInput = document.getElementById('input-maint-notes');

  const currentKm = parseFloat(currentKmInput.value);
  const nextKm = parseFloat(nextKmInput.value);
  const intervalKm = parseFloat(intervalKmInput?.value) || 3000;

  if (isNaN(currentKm) || currentKm < 0) {
    showToast('Please enter your current or last serviced odometer reading', 'danger');
    return;
  }

  if (isNaN(nextKm) || nextKm <= 0) {
    showToast('Please enter the odometer reading when next service is due', 'danger');
    return;
  }

  const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();

  const payload = {
    id: currentEditingMaintId || generateId('maint'),
    bikeId: activeBike ? activeBike.id : 'bike_demo_hunter350',
    userId: authService.getUserId() || 'user_demo_rajarshee',
    type: typeSelect.value,
    currentKm,
    lastServiceKm: currentKm,
    nextServiceKm: nextKm,
    intervalKm,
    lastServiceDate: dateInput.value || getTodayDateString(),
    nextServiceDate: nextDateInput ? nextDateInput.value : '',
    notes: notesInput.value.trim(),
    completedDate: null
  };

  if (currentEditingMaintId) {
    maintenanceService.updateMaintenanceScheduleItem(currentEditingMaintId, payload);
    showToast('Service details updated ✓', 'success');
  } else {
    maintenanceService.addMaintenanceScheduleItem(payload);
    showToast("Service planned! We'll remind you when it's getting close ✓", 'success');
  }

  closeMaintModal();
  renderMaintenance(navigateToTab);
}

/**
 * Handle smart completion of a maintenance item:
 * 1. Prompt completion odometer and date
 * 2. Archive to maintenance history
 * 3. Automatically advance interval for next cycle
 */
function handleSmartMarkComplete(id, currentOdo, navigateToTab) {
  const records = maintenanceService.getAllMaintenance();
  const item = records.find(m => m.id === id);
  if (!item) return;

  const friendlyTitles = {
    'Engine Oil': 'Oil change',
    'Engine Oil & Filter': 'Oil & filter change',
    'Oil Filter': 'Oil filter change',
    'Air Filter': 'Air filter check',
    'Brake Pads': 'Brake check',
    'Chain Service': 'Chain maintenance',
    'Tyres': 'Tire inspection',
    'Spark Plug': 'Spark plug check',
    'General Service': 'General service'
  };
  const titleName = friendlyTitles[item.type] || item.type;

  const interval = item.intervalKm || (item.nextServiceKm > item.lastServiceKm ? (item.nextServiceKm - item.lastServiceKm) : 3000);
  const nextTargetKm = currentOdo + interval;

  const promptOdo = window.prompt(
    `Mark "${titleName}" as done!\n\nEnter odometer reading at completion:`,
    currentOdo
  );

  if (promptOdo === null) return; // User cancelled
  const completedKm = parseFloat(promptOdo) || currentOdo;
  const todayStr = getTodayDateString();

  // Calculate new next date in ~3 months
  const nextDateObj = new Date();
  nextDateObj.setMonth(nextDateObj.getMonth() + 3);
  const nextDateStr = nextDateObj.toISOString().split('T')[0];

  // 1. Save to History
  maintenanceService.addMaintenanceRecord({
    vehicleId: item.bikeId || item.vehicleId,
    serviceType: item.type,
    mileage: completedKm,
    serviceDate: todayStr,
    notes: item.notes || `Completed at ${formatNumber(completedKm)} km`
  });

  // 2. Advance Active Record
  item.lastServiceKm = completedKm;
  item.currentKm = completedKm;
  item.nextServiceKm = completedKm + interval;
  item.lastServiceDate = todayStr;
  item.nextServiceDate = nextDateStr;
  item.intervalKm = interval;

  maintenanceService.updateMaintenanceScheduleItem(item.id, item);

  showToast('Marked as done! Kept your service history updated 🎉', 'success');
  renderMaintenance(navigateToTab);
}

function handleDeleteMaintenance(id, navigateToTab) {
  const confirmed = window.confirm('Remove this service reminder?');
  if (confirmed) {
    maintenanceService.deleteMaintenanceScheduleItem(id);
    showToast('Service reminder removed', 'normal');
    renderMaintenance(navigateToTab);
  }
}

/**
 * Quick Add Service action triggered from Dashboard
 */
function setupQuickServiceModal(navigateToTab) {
  const modal = document.getElementById('modal-quick-service');
  const closeBtn = document.getElementById('btn-close-quick-service');
  const form = document.getElementById('form-quick-service');

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (modal) modal.classList.remove('active');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const type = document.getElementById('quick-service-type').value;
      const odo = parseFloat(document.getElementById('quick-service-odo').value) || 0;
      const interval = parseFloat(document.getElementById('quick-service-interval').value) || 3000;
      const date = document.getElementById('quick-service-date').value || getTodayDateString();

      const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();

      // Compute target date in 3 months
      const targetDate = new Date();
      targetDate.setMonth(targetDate.getMonth() + 3);
      const targetDateStr = targetDate.toISOString().split('T')[0];

      maintenanceService.addMaintenanceScheduleItem({
        bikeId: activeBike ? activeBike.id : 'bike_demo_hunter350',
        userId: authService.getUserId() || 'user_demo_rajarshee',
        type,
        currentKm: odo,
        lastServiceKm: odo,
        nextServiceKm: odo + interval,
        intervalKm: interval,
        lastServiceDate: date,
        nextServiceDate: targetDateStr,
        notes: 'Quick added from dashboard'
      });

      if (modal) modal.classList.remove('active');
      showToast(`Added ${type} reminder ✓`, 'success');
      navigateToTab('dashboard');
    });
  }
}

export function openQuickServiceModal() {
  const modal = document.getElementById('modal-quick-service');
  const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();
  const odoInput = document.getElementById('quick-service-odo');
  const dateInput = document.getElementById('quick-service-date');

  if (odoInput) odoInput.value = activeBike ? (activeBike.currentMileage ?? activeBike.currentOdo ?? 0) : 0;
  if (dateInput) dateInput.value = getTodayDateString();

  if (modal) modal.classList.add('active');
}
