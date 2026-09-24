/**
 * Application Configuration
 * Client-safe settings only.
 * NEVER put secret keys in this file.
 */

export const CLERK_PUBLISHABLE_KEY =
  (typeof window !== 'undefined' && window.CLERK_PUBLISHABLE_KEY) ||
  'pk_test_ZXZvbHZpbmctYnVycm8tMjQ1Mi5jbGVyay5hY2NvdW50cy5kZXYk';

export const CLERK_JS_URL =
  'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5.54.1/dist/clerk.browser.js';
