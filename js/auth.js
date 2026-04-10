// Bood CRM — Google OAuth 2.0 via Google Identity Services
import { GOOGLE_CLIENT_ID, SCOPES } from './config.js';

let tokenClient = null;
let currentToken = null;
let tokenExpiry = 0;

export function initAuth(onSignIn, onSignOut) {
  return new Promise((resolve) => {
    // Wait for GIS to load
    if (typeof google === 'undefined') {
      window.addEventListener('load', () => _initTokenClient(onSignIn, onSignOut, resolve));
    } else {
      _initTokenClient(onSignIn, onSignOut, resolve);
    }
  });
}

function _initTokenClient(onSignIn, onSignOut, resolve) {
  try {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPES,
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          console.error('Auth error:', tokenResponse.error);
          showAuthError(tokenResponse.error);
          onSignOut && onSignOut();
          return;
        }
        currentToken = tokenResponse.access_token;
        tokenExpiry = Date.now() + (tokenResponse.expires_in - 60) * 1000;
        sessionStorage.setItem('gsi_token', currentToken);
        sessionStorage.setItem('gsi_token_expiry', tokenExpiry.toString());
        onSignIn && onSignIn(currentToken);
      },
    });

    // Try restoring from session
    const savedToken = sessionStorage.getItem('gsi_token');
    const savedExpiry = parseInt(sessionStorage.getItem('gsi_token_expiry') || '0');
    if (savedToken && savedExpiry > Date.now()) {
      currentToken = savedToken;
      tokenExpiry = savedExpiry;
      onSignIn && onSignIn(currentToken);
    }

    resolve();
  } catch (e) {
    console.error('Failed to init GIS:', e);
    resolve();
  }
}

export function signIn() {
  if (!tokenClient) {
    showAuthError('Google Identity Services not loaded. Check your internet connection.');
    return;
  }
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

export function signOut() {
  if (currentToken) {
    google.accounts.oauth2.revoke(currentToken, () => {});
  }
  currentToken = null;
  tokenExpiry = 0;
  sessionStorage.removeItem('gsi_token');
  sessionStorage.removeItem('gsi_token_expiry');
}

export function isSignedIn() {
  return !!(currentToken && tokenExpiry > Date.now());
}

export async function getAccessToken() {
  if (currentToken && tokenExpiry > Date.now()) {
    return currentToken;
  }
  // Token expired — request a new one silently
  return new Promise((resolve, reject) => {
    if (!tokenClient) { reject(new Error('Not initialized')); return; }
    const origCallback = tokenClient.callback;
    tokenClient.callback = (resp) => {
      tokenClient.callback = origCallback;
      if (resp.error) { reject(new Error(resp.error)); return; }
      currentToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
      sessionStorage.setItem('gsi_token', currentToken);
      sessionStorage.setItem('gsi_token_expiry', tokenExpiry.toString());
      resolve(currentToken);
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}
