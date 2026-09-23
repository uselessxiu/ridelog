/**
 * Authentication Service Layer
 * Prepares RideLog for Clerk Authentication.
 * Abstracts user sessions, sign in, sign up, sign out, and reactive state changes.
 */

import { createUser } from '../models/types.js';

const AUTH_STORAGE_KEY = 'ridelog_auth_session';

const DEFAULT_DEMO_USER = createUser({
  id: 'user_demo_rajarshee',
  clerkUserId: 'user_2Nqxyz_demo_rajarshee',
  name: 'Rajarshee',
  email: 'rajarshee@ridelog.io',
  createdAt: '2023-04-10T00:00:00.000Z'
});

class AuthService {
  constructor() {
    this._listeners = new Set();
    this._currentUser = null;
    this._loadSession();
  }

  _loadSession() {
    try {
      const isExplicitlyLoggedOut = localStorage.getItem('ridelog_logged_out') === 'true';
      if (isExplicitlyLoggedOut) {
        this._currentUser = null;
        return;
      }

      const stored = localStorage.getItem(AUTH_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this._currentUser = parsed ? createUser(parsed) : null;
      } else {
        // Default to demo rider for smooth existing workflow
        this._currentUser = DEFAULT_DEMO_USER;
        this._saveSession(this._currentUser);
      }
    } catch (e) {
      console.warn('AuthService session load error, falling back to demo user:', e);
      this._currentUser = DEFAULT_DEMO_USER;
    }
  }

  _saveSession(user) {
    try {
      if (user) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to save auth session:', e);
    }
  }

  _notifyListeners() {
    this._listeners.forEach(cb => {
      try { cb(this._currentUser); } catch (e) { console.error('Auth listener error:', e); }
    });
  }

  /**
   * Subscribe to auth state changes (Clerk-ready listener)
   * @param {Function} callback - Called whenever auth state changes
   * @returns {Function} Unsubscribe function
   */
  onAuthStateChanged(callback) {
    this._listeners.add(callback);
    // Immediately call with current state
    try { callback(this._currentUser); } catch (e) { console.error(e); }
    return () => this._listeners.delete(callback);
  }

  /**
   * Returns current authenticated user or null
   */
  getCurrentUser() {
    return this._currentUser;
  }

  /**
   * Returns active user's internal ID
   */
  getUserId() {
    return this._currentUser ? this._currentUser.id : null;
  }

  /**
   * Returns active user's Clerk user ID
   */
  getClerkUserId() {
    return this._currentUser ? this._currentUser.clerkUserId : null;
  }

  /**
   * Check if user is currently authenticated
   */
  isAuthenticated() {
    return Boolean(this._currentUser && this._currentUser.id);
  }

  /**
   * Sign In with email & password (mock / ready for Clerk.signIn)
   */
  async signIn({ email, password } = {}) {
    // If logging in with demo email or any mock credentials
    const cleanEmail = (email || '').trim().toLowerCase();
    const name = cleanEmail ? cleanEmail.split('@')[0] : 'Rider';
    const formattedName = name.charAt(0).toUpperCase() + name.slice(1);

    const user = createUser({
      id: cleanEmail === 'rajarshee@ridelog.io' ? 'user_demo_rajarshee' : `user_${Date.now()}`,
      clerkUserId: `user_clerk_${Date.now()}`,
      name: formattedName,
      email: cleanEmail || 'rider@ridelog.io'
    });

    try { localStorage.removeItem('ridelog_logged_out'); } catch(e){}
    this._currentUser = user;
    this._saveSession(user);
    this._notifyListeners();
    return user;
  }

  /**
   * Sign Up with name, email & password (mock / ready for Clerk.signUp)
   */
  async signUp({ name, email, password } = {}) {
    const user = createUser({
      id: `user_${Date.now()}`,
      clerkUserId: `user_clerk_${Date.now()}`,
      name: name || 'Rider',
      email: email || ''
    });

    try { localStorage.removeItem('ridelog_logged_out'); } catch(e){}
    this._currentUser = user;
    this._saveSession(user);
    this._notifyListeners();
    return user;
  }

  /**
   * Sign Out current user
   */
  async signOut() {
    this._currentUser = null;
    this._saveSession(null);
    try { localStorage.setItem('ridelog_logged_out', 'true'); } catch(e){}
    this._notifyListeners();
    return true;
  }

  /**
   * Restore default demo user session
   */
  restoreDemoUser() {
    try { localStorage.removeItem('ridelog_logged_out'); } catch(e){}
    this._currentUser = DEFAULT_DEMO_USER;
    this._saveSession(DEFAULT_DEMO_USER);
    this._notifyListeners();
    return DEFAULT_DEMO_USER;
  }
}

export const authService = new AuthService();
