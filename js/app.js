
import { storage } from './storage.js';
import { authService } from './services/auth.js';
import { vehicleService } from './services/vehicles.js';
import { maintenanceService } from './services/maintenance.js';
import { serviceHistoryService } from './services/serviceHistory.js';
import { onboardingService } from './services/onboarding.js';
import { showToast, formatNumber } from './utils.js';
import { renderDashboard, renderMileageChart } from './dashboard.js';
import { initRidesModule, renderRideHistory, resetRideForm, openRideDetailModal, prefillStartKm } from './rides.js';
import { initMaintenanceModule, renderMaintenance, calculateSmartStatus, openQuickServiceModal } from './maintenance.js';
import { initGarageModule, renderGarage, openBikeModal } from './garage.js';

let currentTab = 'dashboard';

export const ROUTES = {
  PUBLIC: ['landing', 'login', 'signup'],
  PROTECTED: ['dashboard', 'garage', 'maintenance', 'rides', 'add-ride']
};

const TAB_METADATA = {
  'landing': {
    title: 'RideLog',
    subtitle: 'Your Personal Motorcycle Companion'
  },
  'login': {
    title: 'Sign In',
    subtitle: 'Access your garage and maintenance records'
  },
  'signup': {
    title: 'Create Account',
    subtitle: 'Start tracking your machines'
  },
  'dashboard': {
    title: 'Dashboard',
    subtitle: 'Your rides, mileage, and service at a glance'
  },
  'garage': {
    title: 'Garage',
    subtitle: 'Your motorcycles, specs, and odometer readings'
  },
  'add-ride': {
    title: 'Log a Ride',
    subtitle: 'Record distance, fuel stops, and your route'
  },
  'rides': {
    title: 'Ride History',
    subtitle: 'Every trip, mile, and fuel stop logged'
  },
  'maintenance': {
    title: 'Service & Maintenance',
    subtitle: 'Keep your motorcycle running smooth and safe'
  }
};

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

async function initApp() {
  // 1. Run safe schema migration for existing LocalStorage data
  storage.initAndMigrate();

  // 2. Initialize Visual Color Theme System (Obsidian, Graphite, Midnight, Carbon)
  setupThemeSystem();

  // 3. Initialize Clerk Authentication Service
  await authService.initialize();

  // 4. Setup navigation (sidebar and bottom nav)
  setupNavigation();

  // 5. Setup desktop specific controls (search, notification flyout, vehicle switcher)
  setupDesktopComponents();

  // 6. Setup settings & demo data modal
  setupSettingsModal();

  // 7. Setup public screen handlers (landing, login, signup)
  setupPublicScreens();

  // 8. Initialize onboarding wizard
  onboardingService.init(navigateToTab);

  // 9. Initialize feature modules
  initGarageModule(navigateToTab);
  initRidesModule(navigateToTab);
  initMaintenanceModule(navigateToTab);

  // 10. Initial tab render from hash or auth state
  const initialHash = window.location.hash.replace('#', '');
  const allRoutes = [...ROUTES.PUBLIC, ...ROUTES.PROTECTED];
  if (allRoutes.includes(initialHash)) {
    navigateToTab(initialHash);
  } else {
    navigateToTab(authService.isAuthenticated() ? 'dashboard' : 'landing');
  }

  // 11. Dismiss the auth loading screen smoothly (zero flash of protected content)
  const loader = document.getElementById('app-auth-loader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => {
      if (loader.parentNode) loader.remove();
    }, 300);
  }

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (allRoutes.includes(hash)) {
      navigateToTab(hash);
    }
  });

  // 12. Register service worker if supported
  registerServiceWorker();
}

/**
 * Tab Navigation System & Route Protection Guard
 */
export function navigateToTab(tabId, param = null) {
  // 1. Route Protection & Auth Guard
  const isProtected = ROUTES.PROTECTED.includes(tabId);
  const isPublic = ROUTES.PUBLIC.includes(tabId);
  const isAuthenticated = authService.isAuthenticated();

  if (isProtected && !isAuthenticated) {
    showToast('Please sign in to access your garage & dashboard.', 'info');
    navigateToTab('login');
    return;
  }

  if (isAuthenticated && isPublic) {
    navigateToTab('dashboard');
    return;
  }

  currentTab = tabId;
  if (window.location.hash !== '#' + tabId) {
    try { history.replaceState(null, '', '#' + tabId); } catch(e){}
  }

  // Toggle public route view mode (hide sidebar/topbar/nav on public screens)
  if (isPublic) {
    document.body.classList.add('is-public-route');
  } else {
    document.body.classList.remove('is-public-route');
  }

  // Update screen visibility
  document.querySelectorAll('.app-screen').forEach(screen => {
    screen.classList.remove('active');
  });

  const targetScreen = document.getElementById(`screen-${tabId}`);
  if (targetScreen) {
    targetScreen.classList.add('active');
  }

  // Update nav active states across sidebar and mobile bottom nav
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-tab') === tabId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Dynamic Desktop Topbar updates
  const meta = TAB_METADATA[tabId] || { title: 'RideLog', subtitle: '' };
  const titleEl = document.getElementById('topbar-page-title');
  const subEl = document.getElementById('topbar-page-subtitle');
  if (titleEl) titleEl.textContent = meta.title;
  if (subEl) subEl.textContent = meta.subtitle;

  // Scroll to top of content area
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Trigger tab-specific refresh
  if (tabId === 'dashboard') {
    renderDashboard(navigateToTab);
  } else if (tabId === 'garage') {
    renderGarage(navigateToTab);
  } else if (tabId === 'add-ride') {
    if (!param) {
      prefillStartKm();
    }
  } else if (tabId === 'rides') {
    renderRideHistory(navigateToTab);
    if (param) {
      setTimeout(() => openRideDetailModal(param), 100);
    }
  } else if (tabId === 'maintenance') {
    renderMaintenance(navigateToTab);
  }

  // Sync active bike across all desktop & mobile widgets
  syncActiveBikeWidgets();

  // Sync notifications counter & list
  updateDesktopNotifications();

  // 2. Onboarding Gate: If authenticated and 0 vehicles, launch mandatory onboarding
  if (isAuthenticated && onboardingService.isOnboardingRequired()) {
    onboardingService.startOnboarding();
  }
}

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      if (tab === 'settings') {
        const modal = document.getElementById('modal-settings');
        if (modal) {
          document.getElementById('btn-header-settings')?.click() || document.getElementById('btn-topbar-settings')?.click();
        }
        return;
      }
      if (tab === 'add-ride') {
        resetRideForm();
      }
      navigateToTab(tab);
    });
  });

  // Link in dashboard "View all" to open Ride History
  const viewAllRidesBtn = document.getElementById('btn-dash-view-all-rides');
  if (viewAllRidesBtn) {
    viewAllRidesBtn.addEventListener('click', () => navigateToTab('rides'));
  }
}

/**
 * Desktop Topbar, Search, Switcher & Flyout Actions
 */
function setupDesktopComponents() {
  // 1. Desktop Global Search with '/' Keyboard Shortcut
  const searchInput = document.getElementById('desktop-global-search');
  if (searchInput) {
    // Focus search on '/' keypress
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        searchInput.focus();
      }
    });

    searchInput.addEventListener('input', () => {
      const query = searchInput.value.trim();
      if (currentTab !== 'rides') {
        navigateToTab('rides');
      }
      const ridesSearch = document.getElementById('input-ride-search');
      if (ridesSearch) {
        ridesSearch.value = query;
        ridesSearch.dispatchEvent(new Event('input'));
      }
    });
  }

  // 2. Desktop Topbar Active Vehicle Switcher
  const desktopSwitcherBtn = document.getElementById('btn-desktop-bike-switcher');
  const desktopDropdown = document.getElementById('desktop-bike-dropdown');
  if (desktopSwitcherBtn && desktopDropdown) {
    desktopSwitcherBtn.onclick = (e) => {
      e.stopPropagation();
      desktopDropdown.classList.toggle('active');
    };

    document.addEventListener('click', (e) => {
      if (!desktopDropdown.contains(e.target) && e.target !== desktopSwitcherBtn) {
        desktopDropdown.classList.remove('active');
      }
    });
  }

  // 3. Desktop Topbar Notification Flyout
  const notifBtn = document.getElementById('btn-desktop-notifications');
  const notifDropdown = document.getElementById('desktop-notifications-dropdown');
  if (notifBtn && notifDropdown) {
    notifBtn.onclick = (e) => {
      e.stopPropagation();
      notifDropdown.classList.toggle('active');
    };

    document.addEventListener('click', (e) => {
      if (!notifDropdown.contains(e.target) && e.target !== notifBtn) {
        notifDropdown.classList.remove('active');
      }
    });
  }

  const btnNotifViewAll = document.getElementById('btn-notif-view-all');
  if (btnNotifViewAll) {
    btnNotifViewAll.onclick = () => {
      if (notifDropdown) notifDropdown.classList.remove('active');
      navigateToTab('maintenance');
    };
  }

  // 4. Quick Action Topbar Buttons
  const btnTopbarAddRide = document.getElementById('btn-topbar-add-ride');
  if (btnTopbarAddRide) {
    btnTopbarAddRide.onclick = () => {
      resetRideForm();
      navigateToTab('add-ride');
    };
  }

  const btnTopbarQuickService = document.getElementById('btn-topbar-quick-service');
  if (btnTopbarQuickService) {
    btnTopbarQuickService.onclick = () => {
      openQuickServiceModal();
    };
  }

  // 5. Sidebar Active Vehicle Quick Pill click -> My Garage
  const sidebarBikePill = document.getElementById('sidebar-bike-pill');
  if (sidebarBikePill) {
    sidebarBikePill.onclick = () => {
      navigateToTab('garage');
    };
  }
}

/**
 * Synchronize Active Motorcycle Displays Across Sidebar, Topbar, and Dashboard
 */
function syncActiveBikeWidgets() {
  const activeBike = storage.getActiveBike();
  const allBikes = storage.getMotorcycles();
  const riderName = storage.getUserName() || 'Rajarshee';
  const riderEmail = storage.getUserEmail() || 'rajarshee@ridelog.io';
  const avatarLetter = (riderName[0] || 'R').toUpperCase();

  // 1. Sidebar Active Vehicle Pill & Profile
  const sidebarName = document.getElementById('sidebar-active-bike-name');
  const sidebarSub = document.getElementById('sidebar-active-bike-sub');
  const sidebarRider = document.getElementById('sidebar-rider-status');
  const sidebarRiderName = document.getElementById('sidebar-rider-name');
  const sidebarRiderEmail = document.getElementById('sidebar-rider-email');
  const sidebarAvatar = document.getElementById('sidebar-avatar-letter');
  const mobileAvatar = document.getElementById('mobile-header-avatar');

  if (sidebarName) sidebarName.textContent = activeBike.name || 'Hunter 350';
  if (sidebarSub) sidebarSub.textContent = `${activeBike.year || '2023'} · ${formatNumber(activeBike.currentOdo)} km`;
  if (sidebarRider) sidebarRider.textContent = `${riderName} · ${activeBike.name || 'Hunter 350'}`;
  if (sidebarRiderName) sidebarRiderName.textContent = riderName;
  if (sidebarRiderEmail) sidebarRiderEmail.textContent = riderEmail;
  if (sidebarAvatar) sidebarAvatar.textContent = avatarLetter;
  if (mobileAvatar) mobileAvatar.textContent = avatarLetter;

  // 2. Desktop Topbar Switcher Button
  const topbarBikeName = document.getElementById('desktop-topbar-bike-name');
  if (topbarBikeName) topbarBikeName.textContent = activeBike.name || 'Hunter 350';

  // 3. Populate Desktop Bike Switcher Dropdown
  const desktopDropdown = document.getElementById('desktop-bike-dropdown');
  if (desktopDropdown) {
    desktopDropdown.innerHTML = `
      <div class="bike-dropdown-list">
        <div style="font-size: 0.72rem; text-transform: uppercase; color: var(--text-subtle); padding: 8px 12px 4px;">Active Vehicle</div>
        ${allBikes.map(b => `
          <button class="bike-dropdown-item ${b.id === activeBike.id ? 'active' : ''}" data-id="${b.id}">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span>🏍️</span>
              <div style="text-align: left;">
                <div style="font-weight: 600; font-size: 0.88rem; color: var(--text-main);">${b.name}</div>
                <div style="font-size: 0.72rem; color: var(--text-muted);">${formatNumber(b.currentOdo)} km · ${b.year || '2023'}</div>
              </div>
            </div>
            ${b.id === activeBike.id ? '<span style="color: var(--accent); font-weight: 700;">✓</span>' : ''}
          </button>
        `).join('')}
        <div style="border-top: 1px solid var(--border-subtle); margin-top: 4px; padding: 4px;">
          <button class="btn btn-secondary btn-sm" id="btn-desktop-dropdown-add-bike" style="width: 100%; font-size: 0.78rem;">+ Add Motorcycle</button>
        </div>
      </div>
    `;

    desktopDropdown.querySelectorAll('.bike-dropdown-item').forEach(item => {
      item.onclick = () => {
        const id = item.getAttribute('data-id');
        storage.setActiveBikeId(id);
        desktopDropdown.classList.remove('active');
        showToast(`Switched active ride to ${storage.getActiveBike().name} 🏍️`, 'success');
        syncActiveBikeWidgets();
        updateDesktopNotifications();
        navigateToTab(currentTab);
      };
    });

    const addBikeBtn = document.getElementById('btn-desktop-dropdown-add-bike');
    if (addBikeBtn) {
      addBikeBtn.onclick = () => {
        desktopDropdown.classList.remove('active');
        openBikeModal();
      };
    }
  }

  // 4. Mobile header sync
  const headerBikeName = document.getElementById('dash-bike-name');
  const headerBikeDetails = document.getElementById('dash-bike-details');
  if (headerBikeName) headerBikeName.textContent = activeBike.name;
  if (headerBikeDetails) headerBikeDetails.textContent = `${activeBike.year || '2023'} · ${formatNumber(activeBike.currentOdo)} km`;
}

/**
 * Update Desktop Notification Badge Counter and Dropdown List
 */
function updateDesktopNotifications() {
  const activeBike = storage.getActiveBike();
  const maintenance = storage.getMaintenanceByBike(activeBike.id);
  const currentOdo = Number(activeBike.currentOdo) || 0;

  const evaluated = maintenance.map(item => {
    return { ...item, ...calculateSmartStatus(item, currentOdo) };
  });

  // Urgent alerts (overdue or due within 30 days / 1000 km)
  const alerts = evaluated.filter(item => item.isOverdue || item.priority <= 4);
  alerts.sort((a, b) => a.priority - b.priority);

  // Counter badge
  const badge = document.getElementById('topbar-notification-badge');
  if (badge) {
    badge.textContent = alerts.length;
    if (alerts.length > 0) {
      badge.style.display = 'inline-flex';
      badge.style.background = alerts.some(a => a.isOverdue) ? 'var(--danger)' : 'var(--warning)';
      badge.style.color = alerts.some(a => a.isOverdue) ? '#fff' : '#111';
    } else {
      badge.style.display = 'none';
    }
  }

  // Dropdown list items
  const listContainer = document.getElementById('desktop-notifications-list');
  const notifDropdown = document.getElementById('desktop-notifications-dropdown');
  if (listContainer) {
    if (alerts.length === 0) {
      listContainer.innerHTML = `
        <div style="padding: 20px 16px; text-align: center; color: var(--text-muted); font-size: 0.82rem;">
          <div style="font-size: 1.4rem; margin-bottom: 6px;">✨</div>
          <div style="font-weight: 600; color: var(--text-main);">All caught up!</div>
          <div style="margin-top: 2px;">No upcoming service alerts for ${activeBike.name}.</div>
        </div>
      `;
    } else {
      listContainer.innerHTML = alerts.map(item => `
        <div class="topbar-notif-item" data-id="${item.id}" style="padding: 10px 14px; border-bottom: 1px solid var(--border-subtle); cursor: pointer; transition: background 0.15s ease;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
            <span style="font-weight: 700; font-size: 0.85rem; color: var(--text-main);">${item.type}</span>
            ${item.statusBadge}
          </div>
          <div style="font-size: 0.74rem; color: var(--text-muted);">
            ${item.statusText}
          </div>
        </div>
      `).join('');

      listContainer.querySelectorAll('.topbar-notif-item').forEach(item => {
        item.onclick = () => {
          if (notifDropdown) notifDropdown.classList.remove('active');
          navigateToTab('maintenance');
        };
        item.onmouseenter = () => item.style.background = 'var(--bg-secondary)';
        item.onmouseleave = () => item.style.background = 'transparent';
      });
    }
  }
}

/**
 * Visual Color Theme System
 * Permanent Theme: Midnight Cyan
 */
function setupThemeSystem() {
  document.documentElement.setAttribute('data-theme', 'midnight');
  storage.setTheme('midnight');
  const themeColorMeta = document.querySelector('meta[name="theme-color"]');
  if (themeColorMeta) {
    themeColorMeta.setAttribute('content', '#07111F');
  }
}

export function applyTheme() {
  document.documentElement.setAttribute('data-theme', 'midnight');
}

/**
 * Settings & Demo Data Modal
 */
function setupSettingsModal() {
  const modal = document.getElementById('modal-settings');
  const openBtnHeader = document.getElementById('btn-header-settings');
  const openBtnTopbar = document.getElementById('btn-topbar-settings');
  const openBtnSidebar = document.getElementById('btn-sidebar-settings');
  const openBtnSidebarNav = document.getElementById('btn-sidebar-settings-nav');
  const openBtnSidebarProfile = document.getElementById('btn-sidebar-user-profile');
  const openBtnMobileAvatar = document.getElementById('mobile-header-avatar');
  const logoutBtn = document.getElementById('btn-sidebar-logout');
  const closeBtn = document.getElementById('btn-close-settings-modal');
  const closeFooterBtn = document.getElementById('btn-close-settings-footer');
  const bikeNameInput = document.getElementById('input-settings-bike');
  const saveBikeBtn = document.getElementById('btn-save-bike-name');
  const userNameInput = document.getElementById('input-settings-user');
  const saveUserBtn = document.getElementById('btn-save-user-name');
  const bikePicInput = document.getElementById('input-bike-picture');

  const openModal = () => {
    const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();
    if (bikeNameInput) bikeNameInput.value = activeBike ? (activeBike.name || 'Hunter 350') : 'Hunter 350';
    if (userNameInput) userNameInput.value = storage.getUserName() || 'Rajarshee';

    // Render Bike Picture upload dropzone or preview card
    renderSettingsBikePicture(activeBike);

    // Highlight currently active theme in settings
    const activeTheme = storage.getTheme();
    document.querySelectorAll('#theme-selector-options .theme-card-option').forEach(btn => {
      if (btn.getAttribute('data-theme') === activeTheme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (modal) modal.classList.add('active');
  };

  if (openBtnHeader) openBtnHeader.addEventListener('click', openModal);
  if (openBtnTopbar) openBtnTopbar.addEventListener('click', openModal);
  if (openBtnSidebarNav) openBtnSidebarNav.addEventListener('click', openModal);
  if (openBtnSidebarProfile) {
    openBtnSidebarProfile.addEventListener('click', () => {
      if (authService.isAuthenticated()) {
        authService.openUserProfile();
      } else {
        openModal();
      }
    });
  }
  if (openBtnMobileAvatar) {
    openBtnMobileAvatar.addEventListener('click', () => {
      if (authService.isAuthenticated()) {
        authService.openUserProfile();
      } else {
        openModal();
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await authService.signOut();
      if (modal) modal.classList.remove('active');
      showToast('Logged out session. See you next ride!', 'info');
      navigateToTab('landing');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      if (modal) modal.classList.remove('active');
    });
  }

  if (closeFooterBtn) {
    closeFooterBtn.addEventListener('click', () => {
      if (modal) modal.classList.remove('active');
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
  }

  // Save rider name
  if (saveUserBtn) {
    saveUserBtn.addEventListener('click', () => {
      const newName = userNameInput ? userNameInput.value.trim() : '';
      if (newName) {
        storage.setUserName(newName);
        syncActiveBikeWidgets();
        showToast(`Saved! Good to ride with you, ${newName} 👋`, 'success');
        if (modal) modal.classList.remove('active');
        navigateToTab(currentTab);
      }
    });
  }

  // Save active bike name
  if (saveBikeBtn) {
    saveBikeBtn.addEventListener('click', () => {
      const newName = bikeNameInput.value.trim() || 'Hunter 350';
      const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();
      activeBike.name = newName;
      vehicleService.updateVehicle(activeBike.id, { name: newName });
      storage.updateMotorcycle(activeBike);

      const settings = storage.getSettings();
      settings.bikeName = newName;
      storage.saveSettings(settings);

      syncActiveBikeWidgets();

      showToast('Motorcycle name updated ✓', 'success');
      if (modal) modal.classList.remove('active');
      navigateToTab(currentTab);
    });
  }

  // Setup Bike Picture upload listener
  if (bikePicInput) {
    bikePicInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // 1. File format validation
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      const fileExt = file.name.split('.').pop().toLowerCase();
      if (!allowedTypes.includes(file.type) && !['jpg', 'jpeg', 'png', 'webp'].includes(fileExt)) {
        showToast('Please select a valid image file (JPG, PNG, or WebP).', 'danger');
        bikePicInput.value = '';
        return;
      }

      // 2. File size validation (Max 5 MB)
      const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
      if (file.size > MAX_SIZE) {
        showToast('Image size exceeds 5 MB. Please select a smaller photo.', 'danger');
        bikePicInput.value = '';
        return;
      }

      try {
        showToast('Processing photo...', 'info');
        const reader = new FileReader();
        reader.onload = async (evt) => {
          const rawDataUrl = evt.target.result;
          // Scale/compress image via canvas to stay safely within localStorage limits
          const optimizedDataUrl = await optimizeImage(rawDataUrl, 1200, 0.85);

          const activeBike = vehicleService.getActiveVehicle() || storage.getActiveBike();
          if (!activeBike) {
            showToast('No active motorcycle found to attach photo.', 'danger');
            return;
          }

          // Persist image on vehicle entity via service abstraction and storage
          activeBike.imageUrl = optimizedDataUrl;
          activeBike.image = optimizedDataUrl;
          vehicleService.updateVehicle(activeBike.id, {
            imageUrl: optimizedDataUrl,
            image: optimizedDataUrl
          });
          storage.updateMotorcycle(activeBike);

          // Update settings modal preview immediately
          renderSettingsBikePicture(activeBike);

          // Re-render dashboard active hero card and garage
          syncActiveBikeWidgets();
          if (currentTab === 'dashboard') {
            renderDashboard(navigateToTab);
          } else if (currentTab === 'garage') {
            renderGarage(navigateToTab);
          }

          showToast('Bike picture updated successfully! 🏍️', 'success');
          bikePicInput.value = '';
        };
        reader.onerror = () => {
          showToast('Failed to read image file. Please try another.', 'danger');
          bikePicInput.value = '';
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error('Image upload failed:', err);
        showToast('Could not process image.', 'danger');
        bikePicInput.value = '';
      }
    });
  }
}

/**
 * Render Bike Picture UI inside Settings Modal
 * Shows uploaded picture with [Change] and [✕] (reset) buttons,
 * or empty dashed dropzone with "+" icon.
 * @param {Object} activeBike
 */
function renderSettingsBikePicture(activeBike) {
  const container = document.getElementById('bike-picture-container');
  if (!container) return;

  const currentBike = activeBike || vehicleService.getActiveVehicle() || storage.getActiveBike();
  const hasCustom = vehicleService.hasCustomImage(currentBike);
  const displayImg = vehicleService.getVehicleImage(currentBike);

  if (hasCustom) {
    container.innerHTML = `
      <div class="bike-picture-preview-card">
        <div style="display: flex; align-items: center; gap: 14px; min-width: 0;">
          <div class="bike-picture-thumb-wrap">
            <img src="${displayImg}" alt="${currentBike.name || 'Bike'}" class="bike-picture-thumb" id="settings-bike-img-preview" />
          </div>
          <div style="min-width: 0;">
            <div style="font-size: 0.88rem; font-weight: 700; color: #FFFFFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${currentBike.name || 'Active Machine'}
            </div>
            <div style="font-size: 0.74rem; color: #64748B; margin-top: 2px;">Custom motorcycle photo</div>
          </div>
        </div>
        <div style="display: flex; gap: 8px; flex-shrink: 0;">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-change-bike-picture" style="width: auto; padding: 6px 14px; font-size: 0.78rem;">Change</button>
          <button type="button" class="btn btn-outline btn-sm" id="btn-remove-bike-picture" title="Reset to default photo" style="width: auto; padding: 6px 10px; font-size: 0.78rem; color: #EF4444; border-color: rgba(239, 68, 68, 0.3);">✕</button>
        </div>
      </div>
    `;

    document.getElementById('btn-change-bike-picture')?.addEventListener('click', () => {
      document.getElementById('input-bike-picture')?.click();
    });

    document.getElementById('btn-remove-bike-picture')?.addEventListener('click', () => {
      const defaultImg = (currentBike.model || currentBike.name || '').toLowerCase().includes('duke') ? 'assets/duke-390.jpg' : 'assets/hunter-350.jpg';
      currentBike.imageUrl = '';
      currentBike.image = defaultImg;
      vehicleService.updateVehicle(currentBike.id, { imageUrl: '', image: defaultImg });
      storage.updateMotorcycle(currentBike);
      renderSettingsBikePicture(currentBike);
      syncActiveBikeWidgets();
      if (currentTab === 'dashboard') renderDashboard(navigateToTab);
      else if (currentTab === 'garage') renderGarage(navigateToTab);
      showToast('Bike picture reset to default.', 'info');
    });
  } else {
    container.innerHTML = `
      <div id="btn-trigger-bike-upload" class="bike-picture-upload-dropzone">
        <div class="bike-picture-plus-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
        <div style="font-size: 0.88rem; font-weight: 700; color: #FFFFFF;">Add bike picture</div>
        <div style="font-size: 0.75rem; color: #64748B; margin-top: 4px;">JPG, PNG or WebP · Max 5 MB</div>
      </div>
    `;

    document.getElementById('btn-trigger-bike-upload')?.addEventListener('click', () => {
      document.getElementById('input-bike-picture')?.click();
    });
  }
}

/**
 * Resize and compress image using HTML5 Canvas to safely store in localStorage
 * @param {string} dataUrl - Raw image data URL
 * @param {number} maxDimension - Max width or height (e.g. 1200)
 * @param {number} quality - JPEG compression quality (0.0 to 1.0)
 * @returns {Promise<string>}
 */
function optimizeImage(dataUrl, maxDimension = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (dataUrl.startsWith('data:image/png')) {
        ctx.drawImage(img, 0, 0, width, height);
        const compressedPng = canvas.toDataURL('image/png');
        if (compressedPng.length < 900000) {
          resolve(compressedPng);
          return;
        }
      }

      ctx.drawImage(img, 0, 0, width, height);
      const outputType = dataUrl.startsWith('data:image/webp') ? 'image/webp' : 'image/jpeg';
      resolve(canvas.toDataURL(outputType, quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Setup Event Listeners for Public Screens (Landing, Login, Signup)
 */
function setupPublicScreens() {
  // 1. Landing Screen Actions
  const btnLandingSignin = document.getElementById('btn-landing-signin');
  if (btnLandingSignin) {
    btnLandingSignin.addEventListener('click', () => navigateToTab('login'));
  }

  const btnLandingSignup = document.getElementById('btn-landing-signup');
  if (btnLandingSignup) {
    btnLandingSignup.addEventListener('click', () => navigateToTab('signup'));
  }

  // 2. Login Screen Actions
  const formLogin = document.getElementById('form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email')?.value.trim();
      const password = document.getElementById('login-password')?.value;
      try {
        showToast('Signing in with Clerk...', 'info');
        const user = await authService.signIn({ email, password });
        if (user) {
          showToast(`Welcome back, ${user.name}! 🏍️`, 'success');
          navigateToTab('dashboard');
        }
      } catch (err) {
        showToast(err.message || 'Login failed', 'danger');
      }
    });
  }

  const btnLoginClerkModal = document.getElementById('btn-login-clerk-modal');
  if (btnLoginClerkModal) {
    btnLoginClerkModal.addEventListener('click', async () => {
      try {
        await authService.openSignIn();
      } catch (err) {
        showToast(err.message || 'Failed to open Clerk modal', 'danger');
      }
    });
  }

  const btnGotoSignup = document.getElementById('btn-goto-signup');
  if (btnGotoSignup) {
    btnGotoSignup.addEventListener('click', () => navigateToTab('signup'));
  }

  // 3. Signup Screen Actions
  const formSignup = document.getElementById('form-signup');
  if (formSignup) {
    formSignup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('signup-name')?.value.trim();
      const email = document.getElementById('signup-email')?.value.trim();
      const password = document.getElementById('signup-password')?.value;
      try {
        showToast('Creating account with Clerk...', 'info');
        const user = await authService.signUp({ name, email, password });
        if (user) {
          showToast(`Account created! Welcome, ${user.name}! 🏍️`, 'success');
          navigateToTab('dashboard');
        }
      } catch (err) {
        showToast(err.message || 'Signup failed', 'danger');
      }
    });
  }

  const btnSignupClerkModal = document.getElementById('btn-signup-clerk-modal');
  if (btnSignupClerkModal) {
    btnSignupClerkModal.addEventListener('click', async () => {
      try {
        await authService.openSignUp();
      } catch (err) {
        showToast(err.message || 'Failed to open Clerk modal', 'danger');
      }
    });
  }

  const btnGotoLogin = document.getElementById('btn-goto-login');
  if (btnGotoLogin) {
    btnGotoLogin.addEventListener('click', () => navigateToTab('login'));
  }

  // 4. Reactive auth state listener to refresh UI widgets on auth change
  authService.onAuthStateChanged((user) => {
    syncActiveBikeWidgets();
  });
}


/**
 * PWA Service Worker Registration
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js')
        .then(reg => {
          console.log('RideLog ServiceWorker registered with scope:', reg.scope);
        })
        .catch(err => {
          console.log('RideLog ServiceWorker registration failed:', err);
        });
    });
  }
}


