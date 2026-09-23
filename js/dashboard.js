
import { storage } from './storage.js';
import { vehicleService } from './services/vehicles.js';
import { maintenanceService } from './services/maintenance.js';
import { serviceHistoryService } from './services/serviceHistory.js';
import { authService } from './services/auth.js';
import { formatNumber, formatCurrency, formatDate, getGreeting, showToast } from './utils.js';
import { calculateSmartStatus, openQuickServiceModal } from './maintenance.js';
import { openBikeModal } from './garage.js';

let mileageChartInstance = null;

export function renderDashboard(navigateToTab) {
  const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();
  const allBikes = vehicleService.getVehicles();
  const bikeId = activeBike ? activeBike.id : null;
  const rides = bikeId ? serviceHistoryService.getRides(bikeId) : [];
  const maintenance = bikeId ? maintenanceService.getMaintenance(bikeId) : [];
  const currentUser = authService.getCurrentUser();
  const riderName = currentUser?.name || storage.getUserName() || 'Rajarshee';

  // 1. Desktop Greeting Header
  const greetingEl = document.getElementById('dash-greeting-text');
  if (greetingEl) greetingEl.textContent = getGreeting(riderName);

  const subGreetingEl = document.getElementById('dash-greeting-sub');
  if (subGreetingEl) subGreetingEl.textContent = `Here's the status of your machine today.`;

  // 2. Render Figma Hero Card
  renderFigmaHeroCard(activeBike, maintenance, navigateToTab);

  // 3. Render 4 Figma Metric Cards
  renderFigmaMetricCards(activeBike, maintenance);

  // 4. Render "What's coming up?" Tasks List
  renderFigmaUpcomingTasks(activeBike, maintenance, navigateToTab);

  // 5. Compute dynamic stats from active bike's rides
  let totalDistance = 0;
  let totalFuel = 0;
  let totalFuelCost = 0;
  const totalRides = rides.length;

  rides.forEach(ride => {
    totalDistance += Number(ride.distance) || 0;
    totalFuel += Number(ride.fuel) || 0;
    totalFuelCost += Number(ride.fuelCost) || 0;
  });

  const avgMileage = totalFuel > 0 ? (totalDistance / totalFuel).toFixed(1) : '0.0';

  const totalDistEl = document.getElementById('stat-total-dist');
  const avgMileageEl = document.getElementById('stat-avg-mileage');
  const fuelCostEl = document.getElementById('stat-fuel-cost');
  const totalRidesEl = document.getElementById('stat-total-rides');

  if (totalDistEl) totalDistEl.textContent = `${formatNumber(totalDistance)} km`;
  if (avgMileageEl) avgMileageEl.textContent = `${avgMileage} km/L`;
  if (fuelCostEl) fuelCostEl.textContent = formatCurrency(totalFuelCost);
  if (totalRidesEl) totalRidesEl.textContent = totalRides;

  // 6. Recent Rides preview (latest 3)
  renderRecentRides(rides.slice(0, 3), navigateToTab);

  // 7. Mileage trend chart
  renderMileageChart(rides);

  // 8. Wire view all buttons
  const btnViewAllMaint = document.getElementById('btn-dash-view-all-maint');
  if (btnViewAllMaint) {
    btnViewAllMaint.onclick = () => navigateToTab('maintenance');
  }

  const btnViewAllRides = document.getElementById('btn-dash-view-all-rides');
  if (btnViewAllRides) {
    btnViewAllRides.onclick = () => navigateToTab('rides');
  }
}

/**
 * Render Figma Hero Vehicle Card with image, status, odo, and action buttons
 */
function renderFigmaHeroCard(activeBike, maintenance, navigateToTab) {
  const container = document.getElementById('dash-hero-container');
  if (!container) return;

  const currentOdo = Number(activeBike.currentOdo) || 0;
  const evaluatedMaint = maintenance.map(item => ({ ...item, ...calculateSmartStatus(item, currentOdo) }));
  const overdueItem = evaluatedMaint.find(item => item.isOverdue);
  const soonItem = evaluatedMaint.find(item => item.priority <= 4);

  let statusClass = 'healthy';
  let statusText = 'All good to ride';
  if (overdueItem) {
    statusClass = 'overdue';
    statusText = 'Service overdue';
  } else if (soonItem) {
    statusClass = 'soon';
    statusText = 'Service due soon';
  }

  // Calculate Last service diff (Hunter 350 demo data: 12,450 - 9,650 = 2,800 km ago)
  let lastServiceKm = Number(activeBike.lastServiceKm) || 0;
  if (!lastServiceKm) {
    const history = maintenanceService.getMaintenanceHistory(activeBike.id);
    if (history.length > 0 && history[0].completedKm) {
      lastServiceKm = Number(history[0].completedKm);
    } else {
      lastServiceKm = Math.max(0, currentOdo - 2800);
    }
  }
  const lastServiceDiff = Math.max(0, currentOdo - lastServiceKm);

  // Calculate Next service remaining
  const validRemaining = evaluatedMaint.map(m => m.remainingKm).filter(km => km > 0);
  const nextServiceRemaining = validRemaining.length > 0 ? Math.min(...validRemaining) : 420;

  const bikeImg = activeBike.image || (activeBike.name && activeBike.name.includes('Duke') ? 'assets/duke-390.jpg' : 'assets/hunter-350.jpg');

  container.innerHTML = `
    <div class="hero-card-figma">
      <div class="hero-top-row">
        <div>
          <div class="hero-tag-badge-wrap">
            <span class="hero-tag-text">ACTIVE MACHINE</span>
            <span class="hero-status-pill ${statusClass}">● ${statusText}</span>
          </div>
          <div class="hero-bike-title">${activeBike.name || 'Hunter 350'}</div>
          <div class="hero-bike-subtitle">${activeBike.manufacturer || 'Royal Enfield'} · ${activeBike.year || '2023'} · ${activeBike.registrationNumber || 'WB-02-AK-1234'}</div>
        </div>
        <div class="hero-odo-wrap">
          <div class="hero-odo-val">${formatNumber(currentOdo)} <small style="font-size: 0.95rem; color: #64748B;">km</small></div>
          <span class="hero-odo-lbl">Current Odometer</span>
        </div>
      </div>

      <div class="hero-img-wrap">
        <img src="${bikeImg}" alt="${activeBike.name}" class="hero-img" />
      </div>

      <div class="hero-footer-bar">
        <div class="hero-stats-group">
          <div class="hero-stat-col">
            <span class="hero-stat-lbl">Last service</span>
            <span class="hero-stat-val">${formatNumber(lastServiceDiff)} km ago</span>
          </div>
          <div class="hero-stat-col">
            <span class="hero-stat-lbl">Next service</span>
            <span class="hero-stat-val amber">${formatNumber(nextServiceRemaining)} km away</span>
          </div>
        </div>

        <div class="hero-actions">
          <button class="btn-update-km" id="btn-hero-update-odo">Update km</button>
          <button class="btn-view-bike" id="btn-hero-view-garage">View bike</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-hero-update-odo')?.addEventListener('click', () => {
    openQuickOdoModal(activeBike, navigateToTab);
  });

  document.getElementById('btn-hero-view-garage')?.addEventListener('click', () => {
    navigateToTab('garage');
  });
}

/**
 * Render 4 Figma Metric Cards: Next Service, Last Service, Tyre Check, Documents
 */
function renderFigmaMetricCards(activeBike, maintenance) {
  const container = document.getElementById('dash-metrics-container');
  if (!container) return;

  const currentOdo = Number(activeBike.currentOdo) || 0;
  const evaluatedMaint = maintenance.map(item => ({ ...item, ...calculateSmartStatus(item, currentOdo) }));
  
  evaluatedMaint.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.remainingKm - b.remainingKm;
  });

  const nextTask = evaluatedMaint[0];
  const nextRemaining = nextTask ? Math.max(0, nextTask.remainingKm) : 420;
  const nextTargetKm = nextTask ? nextTask.nextServiceKm : (currentOdo + 420);
  const nextTaskName = nextTask ? (nextTask.humanTitle || nextTask.type) : 'Engine oil change';

  let lastServiceKm = Number(activeBike.lastServiceKm) || 0;
  if (!lastServiceKm) {
    const history = maintenanceService.getMaintenanceHistory(activeBike.id);
    lastServiceKm = (history.length > 0 && history[0].completedKm) ? Number(history[0].completedKm) : Math.max(0, currentOdo - 2800);
  }
  const lastServiceDiff = Math.max(0, currentOdo - lastServiceKm);

  const nextDotClass = (nextTask && nextTask.isOverdue) ? 'red' : (nextRemaining <= 800 ? 'amber' : 'green');

  container.innerHTML = `
    <!-- Card 1: Next Service -->
    <div class="metric-card-figma">
      <div class="metric-top">
        <div class="metric-dot ${nextDotClass}"></div>
        <span class="metric-lbl">NEXT SERVICE</span>
      </div>
      <div class="metric-val">${formatNumber(nextRemaining)} km</div>
      <div class="metric-sub">${nextTaskName} due at ${formatNumber(nextTargetKm)} km</div>
    </div>

    <!-- Card 2: Last Service -->
    <div class="metric-card-figma">
      <div class="metric-top">
        <div class="metric-dot blue"></div>
        <span class="metric-lbl">LAST SERVICE</span>
      </div>
      <div class="metric-val">${formatNumber(lastServiceDiff)} km ago</div>
      <div class="metric-sub">Routine checkup at Royal Enfield SC</div>
    </div>

    <!-- Card 3: Tyre Check -->
    <div class="metric-card-figma">
      <div class="metric-top">
        <div class="metric-dot green"></div>
        <span class="metric-lbl">TYRE CHECK</span>
      </div>
      <div class="metric-val">Every 500 km</div>
      <div class="metric-sub">Front 29 PSI · Rear 32 PSI</div>
    </div>

    <!-- Card 4: Documents -->
    <div class="metric-card-figma">
      <div class="metric-top">
        <div class="metric-dot green"></div>
        <span class="metric-lbl">DOCUMENTS</span>
      </div>
      <div class="metric-val">Valid</div>
      <div class="metric-sub">Insurance expires in 142 days</div>
    </div>
  `;
}

/**
 * Render "What's coming up?" Task Cards matching Figma design
 */
function renderFigmaUpcomingTasks(activeBike, maintenance, navigateToTab) {
  const container = document.getElementById('dash-upcoming-container');
  if (!container) return;

  const currentOdo = Number(activeBike.currentOdo) || 0;
  const evaluatedMaint = maintenance.map(item => ({ ...item, ...calculateSmartStatus(item, currentOdo) }));

  evaluatedMaint.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.remainingKm - b.remainingKm;
  });

  if (evaluatedMaint.length === 0) {
    container.innerHTML = `
      <div style="background: #13161C; border: 1px solid #1E232E; border-radius: 16px; padding: 24px; text-align: center; color: #64748B;">
        No upcoming tasks scheduled for ${activeBike.name}.
      </div>
    `;
    return;
  }

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

  container.innerHTML = evaluatedMaint.slice(0, 4).map(item => {
    const visuals = getTaskVisuals(item);
    const interval = Number(item.serviceIntervalKm) || 3000;
    const progressPercent = Math.min(100, Math.max(10, Math.round(((interval - Math.max(0, item.remainingKm)) / interval) * 100)));

    let colorClass = visuals.color;
    if (item.isOverdue) colorClass = 'red';
    else if (item.remainingKm <= 500) colorClass = 'amber';

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
            <div class="task-dist-lbl">${item.isOverdue ? 'overdue' : 'away'}</div>
          </div>
        </div>

        <div class="task-progress-bar">
          <div class="task-progress-fill ${colorClass}" style="width: ${progressPercent}%;"></div>
        </div>

        <div class="task-footer-row">
          <span class="task-due-text">Due in ${formatNumber(Math.max(0, item.remainingKm))} km · at ${formatNumber(item.nextServiceKm)} km</span>
          <button class="btn-plan-service" data-id="${item.id}">Plan service</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.btn-plan-service').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToTab('maintenance');
    });
  });
}

/**
 * Open Quick Odometer Update Modal
 */
export function openQuickOdoModal(activeBike, navigateToTab) {
  const modal = document.getElementById('modal-update-odo');
  const input = document.getElementById('input-quick-odo');
  const closeBtn = document.getElementById('btn-close-update-odo');
  const cancelBtn = document.getElementById('btn-cancel-update-odo');
  const form = document.getElementById('form-update-odo');

  if (!modal || !input || !form) return;

  input.value = activeBike.currentOdo || 0;
  modal.classList.add('active');

  const closeModal = () => modal.classList.remove('active');
  closeBtn.onclick = closeModal;
  cancelBtn.onclick = closeModal;

  modal.onclick = (e) => {
    if (e.target === modal) closeModal();
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    const newOdo = Number(input.value);
    if (isNaN(newOdo) || newOdo < 0) return;

    activeBike.currentOdo = newOdo;
    vehicleService.updateVehicle(activeBike.id, { currentMileage: newOdo });
    closeModal();
    showToast(`Odometer updated to ${formatNumber(newOdo)} km 🏍️`, 'success');
    renderDashboard(navigateToTab);
  };
}

function renderRecentRides(recentRides, navigateToTab) {
  const container = document.getElementById('dash-recent-rides');
  if (!container) return;

  if (recentRides.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polygon points="12 8 8 12 12 16 16 12 12 8"></polygon>
          </svg>
        </div>
        <div class="empty-state-title">No rides logged yet.</div>
        <div class="empty-state-desc">Once you hit the road, your trips and fuel stops will show up here.</div>
        <button class="btn btn-primary btn-sm" id="btn-dash-first-ride">+ Log a ride</button>
      </div>
    `;
    const btn = document.getElementById('btn-dash-first-ride');
    if (btn) btn.addEventListener('click', () => navigateToTab('add-ride'));
    return;
  }

  container.innerHTML = `
    <div class="rides-list">
      ${recentRides.map(ride => `
        <div class="ride-card" data-id="${ride.id}">
          <div class="ride-card-top">
            <span class="ride-name">${ride.name || 'Ride'}</span>
            <span class="ride-date">${formatDate(ride.date)}</span>
          </div>
          <div class="ride-route">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            ${ride.route || 'Route not specified'}
            ${ride.startLatitude ? '<span class="badge" style="background: var(--accent-subtle); color: var(--accent); margin-left: auto; font-size: 0.65rem;">🗺️ Route</span>' : ''}
          </div>
          <div class="ride-stats-row">
            <div class="ride-stat">
              <span class="ride-stat-lbl">Distance</span>
              <span class="ride-stat-val">${formatNumber(ride.distance)} <small>km</small></span>
            </div>
            <div class="ride-stat">
              <span class="ride-stat-lbl">Mileage</span>
              <span class="ride-stat-val">${ride.mileage} <small>km/L</small></span>
            </div>
            <div class="ride-stat">
              <span class="ride-stat-lbl">Fuel Cost</span>
              <span class="ride-stat-val">${formatCurrency(ride.fuelCost)}</span>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('.ride-card').forEach(card => {
    card.addEventListener('click', () => {
      navigateToTab('rides', card.getAttribute('data-id'));
    });
  });
}

export function renderMileageChart(rides = null) {
  const canvas = document.getElementById('mileage-chart');
  const emptyChartMsg = document.getElementById('chart-empty-msg');
  if (!canvas) return;

  if (!rides) {
    const activeBike = storage.getActiveBike();
    rides = storage.getRidesByBike(activeBike.id);
  }

  if (!rides || rides.length === 0) {
    canvas.style.display = 'none';
    if (emptyChartMsg) emptyChartMsg.style.display = 'flex';
    return;
  }

  canvas.style.display = 'block';
  if (emptyChartMsg) emptyChartMsg.style.display = 'none';

  const sortedRides = [...rides].sort((a, b) => new Date(a.date) - new Date(b.date));
  const chartRides = sortedRides.slice(-8);

  const labels = chartRides.map(r => {
    const d = r.date ? r.date.split('-') : [];
    return d.length === 3 ? `${d[2]}/${d[1]}` : (r.name || 'Ride');
  });

  const dataValues = chartRides.map(r => Number(r.mileage) || 0);

  if (typeof Chart === 'undefined') {
    return;
  }

  if (mileageChartInstance) {
    mileageChartInstance.destroy();
  }

  // Extract theme colors dynamically from CSS variables
  const computedStyle = getComputedStyle(document.documentElement);
  const primaryColor = computedStyle.getPropertyValue('--primary').trim() || '#3B82F6';
  const secondaryColor = computedStyle.getPropertyValue('--secondary-accent').trim() || '#38BDF8';
  const surfaceColor = computedStyle.getPropertyValue('--surface').trim() || '#111821';
  const borderColor = computedStyle.getPropertyValue('--border').trim() || '#263241';
  const textMuted = computedStyle.getPropertyValue('--text-secondary').trim() || '#94A3B8';
  const textPrimary = computedStyle.getPropertyValue('--text-primary').trim() || '#F8FAFC';

  // Helper to parse hex/rgb to valid rgba() avoiding 8-digit hex DOMException on Canvas
  const toRgba = (colorStr, alpha) => {
    if (!colorStr) return `rgba(59, 130, 246, ${alpha})`;
    colorStr = colorStr.trim();
    if (colorStr.startsWith('#')) {
      let hex = colorStr.slice(1);
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      if (hex.length >= 6) {
        const r = parseInt(hex.substring(0, 2), 16) || 0;
        const g = parseInt(hex.substring(2, 4), 16) || 0;
        const b = parseInt(hex.substring(4, 6), 16) || 0;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
    } else if (colorStr.startsWith('rgb(')) {
      return colorStr.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`);
    }
    return colorStr;
  };

  try {
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, toRgba(primaryColor, 0.35));
    gradient.addColorStop(1, toRgba(primaryColor, 0.0));

    mileageChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Mileage (km/L)',
          data: dataValues,
          borderColor: primaryColor,
          backgroundColor: gradient,
          borderWidth: 2.5,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: secondaryColor,
          pointBorderColor: surfaceColor,
          pointBorderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: surfaceColor,
            titleColor: textMuted,
            bodyColor: textPrimary,
            borderColor: borderColor,
            borderWidth: 1,
            padding: 8,
            callbacks: {
              label: (ctx) => ` ${ctx.parsed.y} km/L`
            }
          }
        },
        scales: {
          x: {
            grid: { color: toRgba(borderColor, 0.25), drawBorder: false },
            ticks: { color: textMuted, font: { size: 10 } }
          },
          y: {
            grid: { color: toRgba(borderColor, 0.25), drawBorder: false },
            ticks: { color: textMuted, font: { size: 10 }, callback: (val) => `${val}` }
          }
        }
      }
    });
  } catch (chartErr) {
    console.warn('Could not render mileage chart with theme:', chartErr);
  }
}
