/**
 * Utilities & Helper Functions
 */

export function generateId(prefix = 'item') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

export function formatNumber(num, decimals = 0) {
  if (isNaN(num) || num === null) return '0';
  return Number(num).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

export function formatCurrency(amount, decimals = 0) {
  return `₹${formatNumber(amount, decimals)}`;
}

export function formatDate(dateString) {
  if (!dateString) return '';
  const parts = dateString.split('-');
  if (parts.length === 3) {
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  }
  return dateString;
}

export function getTodayDateString() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function getGreeting(userName = '') {
  const hour = new Date().getHours();
  let timeGreeting = 'Good evening';
  if (hour >= 5 && hour < 12) {
    timeGreeting = 'Good morning';
  } else if (hour >= 12 && hour < 17) {
    timeGreeting = 'Good afternoon';
  } else if (hour >= 17 && hour < 21) {
    timeGreeting = 'Good evening';
  } else {
    timeGreeting = 'Good night';
  }

  const name = userName ? userName.trim() : '';
  if (name) {
    return `${timeGreeting}, ${name} 👋`;
  }
  return `${timeGreeting} 👋`;
}

export function showToast(message, type = 'normal', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'danger' ? 'toast-danger' : ''}`;
  
  const icon = type === 'success' ? '✓ ' : type === 'danger' ? '⚠ ' : '';
  toast.textContent = `${icon}${message}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-8px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}
