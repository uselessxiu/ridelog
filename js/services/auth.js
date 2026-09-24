/**
 * Authentication Service Layer
 * Official ClerkJS Browser / Vanilla JS Integration.
 * Clerk is the SOLE authentication provider for RideLog.
 * Abstracts user sessions, sign in, sign up, sign out, and reactive state changes.
 */

import { createUser } from '../models/types.js';
import { CLERK_PUBLISHABLE_KEY } from '../config.js';

class AuthService {
  constructor() {
    this._listeners = new Set();
    this._currentUser = null;
    this._initialized = false;
    this._initPromise = null;
  }

  /**
   * Initialize Clerk SDK instance and bind auth state listener
   * @returns {Promise<boolean>}
   */
  async initialize() {
    if (this._initialized) return true;
    if (this._initPromise) return this._initPromise;

    this._initPromise = (async () => {
      try {
        // 1. Wait for window.Clerk script to load from CDN
        let attempts = 0;
        while (!window.Clerk && attempts < 100) {
          await new Promise(r => setTimeout(r, 50));
          attempts++;
        }

        if (!window.Clerk) {
          console.warn('ClerkJS script not yet available on window; checking again on window load');
          await new Promise(resolve => {
            if (document.readyState === 'complete') resolve();
            else window.addEventListener('load', resolve, { once: true });
          });
        }

        if (!window.Clerk) {
          throw new Error('ClerkJS script failed to load from CDN. Check your network connection.');
        }

        // 2. Load Clerk with configured Publishable Key
        if (!window.Clerk.loaded) {
          await window.Clerk.load({
            publishableKey: CLERK_PUBLISHABLE_KEY
          });
        }

        // 3. Map initial user state
        this._syncClerkUser(window.Clerk.user);

        // 4. Register Clerk reactive listener
        window.Clerk.addListener(({ user }) => {
          this._syncClerkUser(user);
          this._notifyListeners();
        });

        this._initialized = true;
        console.log('Clerk AuthService initialized successfully. Active user:', this._currentUser ? this._currentUser.id : 'signed_out');
        return true;
      } catch (err) {
        console.error('AuthService initialization failed:', err);
        this._currentUser = null;
        this._initialized = true;
        return false;
      }
    })();

    return this._initPromise;
  }

  /**
   * Internal mapper from Clerk user object to canonical RideLog USER model
   * @param {Object|null} clerkUser
   */
  _syncClerkUser(clerkUser) {
    if (clerkUser && clerkUser.id) {
      const email = clerkUser.primaryEmailAddress?.emailAddress || '';
      const name = clerkUser.fullName ||
        clerkUser.firstName ||
        (email ? email.split('@')[0] : 'Rider');

      this._currentUser = createUser({
        id: clerkUser.id,           // Exact Clerk user.id for future Firebase integration
        clerkUserId: clerkUser.id,  // Synced Clerk identifier
        name: name,
        email: email,
        createdAt: clerkUser.createdAt ? new Date(clerkUser.createdAt).toISOString() : new Date().toISOString()
      });
    } else {
      this._currentUser = null;
    }
  }

  _notifyListeners() {
    this._listeners.forEach(cb => {
      try { cb(this._currentUser); } catch (e) { console.error('Auth listener error:', e); }
    });
  }

  /**
   * Subscribe to auth state changes
   * @param {Function} callback - Called with (currentUser)
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
   * @returns {Object|null}
   */
  getCurrentUser() {
    return this._currentUser;
  }

  /**
   * Returns active user's internal ID (Clerk user.id)
   * @returns {string|null}
   */
  getUserId() {
    return this._currentUser ? this._currentUser.id : null;
  }

  /**
   * Returns active user's Clerk user ID
   * @returns {string|null}
   */
  getClerkUserId() {
    return this._currentUser ? this._currentUser.clerkUserId : null;
  }

  /**
   * Check if user is currently authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return Boolean(window.Clerk?.user && this._currentUser);
  }

  /**
   * Sign In with email & password via Clerk
   * @param {Object} credentials
   * @param {string} credentials.email
   * @param {string} credentials.password
   * @returns {Promise<Object>} Authenticated USER entity
   */
  async signIn({ email, password } = {}) {
    await this.initialize();
    if (!window.Clerk) throw new Error('Clerk is not available.');

    try {
      const signInAttempt = await window.Clerk.client.signIn.create({
        identifier: email,
        password: password
      });

      if (signInAttempt.status === 'complete') {
        await window.Clerk.setActive({ session: signInAttempt.createdSessionId });
        this._syncClerkUser(window.Clerk.user);
        this._notifyListeners();
        return this._currentUser;
      } else {
        // Missing second factor, email code, or custom factor required -> Open Clerk modal
        await window.Clerk.openSignIn();
        return this._currentUser;
      }
    } catch (err) {
      const message = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || 'Sign in failed.';
      throw new Error(message);
    }
  }

  /**
   * Sign Up with name, email & password via Clerk
   * @param {Object} credentials
   * @param {string} credentials.name
   * @param {string} credentials.email
   * @param {string} credentials.password
   * @returns {Promise<Object>} Authenticated USER entity
   */
  async signUp({ name, email, password } = {}) {
    await this.initialize();
    if (!window.Clerk) throw new Error('Clerk is not available.');

    try {
      const signUpAttempt = await window.Clerk.client.signUp.create({
        emailAddress: email,
        password: password,
        firstName: name
      });

      if (signUpAttempt.status === 'complete') {
        await window.Clerk.setActive({ session: signUpAttempt.createdSessionId });
        this._syncClerkUser(window.Clerk.user);
        this._notifyListeners();
        return this._currentUser;
      } else if (signUpAttempt.status === 'missing_requirements') {
        // If email verification code required
        if (signUpAttempt.unverifiedFields?.includes('email_address')) {
          try {
            await signUpAttempt.prepareEmailAddressVerification({ strategy: 'email_code' });
          } catch(e) {
            console.log('Clerk email verification prepare notice:', e);
          }
        }
        // Open Clerk modal to complete code verification smoothly
        await window.Clerk.openSignUp({
          initialValues: { emailAddress: email }
        });
        return this._currentUser;
      } else {
        await window.Clerk.openSignUp();
        return this._currentUser;
      }
    } catch (err) {
      const message = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || 'Sign up failed.';
      throw new Error(message);
    }
  }

  /**
   * Sign Out current user from Clerk session
   * @returns {Promise<boolean>}
   */
  async signOut() {
    await this.initialize();
    if (window.Clerk) {
      await window.Clerk.signOut();
    }
    this._currentUser = null;
    this._notifyListeners();
    return true;
  }

  /**
   * Open Clerk's modal sign-in UI
   * @param {Object} [options]
   */
  openSignIn(options = {}) {
    if (window.Clerk) {
      return window.Clerk.openSignIn(options);
    }
  }

  /**
   * Open Clerk's modal sign-up UI
   * @param {Object} [options]
   */
  openSignUp(options = {}) {
    if (window.Clerk) {
      return window.Clerk.openSignUp(options);
    }
  }

  /**
   * Open Clerk's user profile modal
   * @param {Object} [options]
   */
  openUserProfile(options = {}) {
    if (window.Clerk) {
      return window.Clerk.openUserProfile(options);
    }
  }
}

export const authService = new AuthService();
