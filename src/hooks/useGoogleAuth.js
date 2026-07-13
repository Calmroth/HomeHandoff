// Google sign-in (Google Identity Services, client-only).
// User registers a Google OAuth Client ID at console.cloud.google.com,
// pastes it into Settings, then signs in via Google's One Tap / button.
// We decode the returned JWT for { sub, email, name, picture } and store
// in localStorage. No backend — identity is verified by Google's signed JWT,
// but we don't verify the signature locally (any malicious actor with dev
// tools can forge a local user object; that's an acceptable trade-off for a
// home dashboard where the threat model is "my flatmate, not the NSA").

import { useState, useEffect, useRef, useCallback } from 'react';

function decodeJwtPayload(jwt) {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch (e) { return null; }
}

// VITE_GOOGLE_CLIENT_ID from .env.local is the authoritative source. If the
// user has manually saved a different ID to localStorage, that takes
// precedence (lets them override without touching the env). If localStorage
// is empty, we fall back to the env value so the GIS button appears on the
// startup screen without any extra steps.
const ENV_GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

export function useGoogleAuth() {
  const [clientId, setClientIdState] = useState(
    () => localStorage.getItem('hdg-g-clientid') || ENV_GOOGLE_CLIENT_ID
  );
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hdg-g-user') || 'null'); } catch (e) { return null; }
  });
  const [error, setError] = useState(null);

  const handleCredential = useCallback((resp) => {
    if (!resp?.credential) { setError('No credential from Google'); return; }
    const payload = decodeJwtPayload(resp.credential);
    if (!payload) { setError('Invalid credential'); return; }
    const u = {
      sub: payload.sub,
      email: payload.email,
      email_verified: payload.email_verified,
      name: payload.name,
      given_name: payload.given_name,
      picture: payload.picture,
      iat: payload.iat,
      exp: payload.exp,
    };
    localStorage.setItem('hdg-g-user', JSON.stringify(u));
    localStorage.setItem('hdg-g-credential', resp.credential);
    setUser(u);
    setError(null);
  }, []);

  // Track `user` in a ref so initialize() can read it for auto_select without
  // re-running on every sign-in/sign-out cycle.
  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  // Ditto handleCredential: keep latest reference behind a ref so the GIS
  // callback closure stays valid even though we only initialize once.
  const handleCredentialRef = useRef(handleCredential);
  useEffect(() => { handleCredentialRef.current = handleCredential; }, [handleCredential]);

  // GSI is a process-wide singleton (window.google.accounts.id). Initializing
  // it twice for the same client_id produces a console warning and "only the
  // last initialized instance will be used" -- harmless functionally but it
  // shows up loudly under React.StrictMode in dev because effects double-
  // invoke. Guard with a ref so re-mounts and HMR don't re-initialize.
  const initializedForClientId = useRef(null);

  useEffect(() => {
    if (!clientId) return;
    if (initializedForClientId.current === clientId) return;
    const init = () => {
      if (!window.google?.accounts?.id) return false;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => handleCredentialRef.current(resp),
        auto_select: !!userRef.current,
        cancel_on_tap_outside: false,
      });
      initializedForClientId.current = clientId;
      return true;
    };
    if (init()) return;
    const t = setInterval(() => { if (init()) clearInterval(t); }, 300);
    return () => clearInterval(t);
  }, [clientId]);

  const promptSignIn = useCallback(() => {
    if (!clientId) { setError('Set a Google Client ID in Settings first.'); return; }
    if (!window.google?.accounts?.id) { setError('Google sign-in is still loading…'); return; }
    setError(null);
    window.google.accounts.id.prompt(); // One Tap. If suppressed, falls back to renderButton below.
  }, [clientId]);

  // For a richer button UX, callers can pass a container ref to renderButton.
  const renderButton = useCallback((el) => {
    if (!el || !clientId || !window.google?.accounts?.id) return;
    el.innerHTML = '';
    window.google.accounts.id.renderButton(el, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
    });
  }, [clientId]);

  const signOut = useCallback(() => {
    if (window.google?.accounts?.id) {
      try { window.google.accounts.id.disableAutoSelect(); } catch (e) {}
      if (user?.sub) try { window.google.accounts.id.revoke(user.sub, () => {}); } catch (e) {}
    }
    localStorage.removeItem('hdg-g-user');
    localStorage.removeItem('hdg-g-credential');
    setUser(null);
  }, [user]);

  const setClientId = useCallback((id) => {
    const v = (id || '').trim();
    if (v) localStorage.setItem('hdg-g-clientid', v);
    else localStorage.removeItem('hdg-g-clientid');
    setClientIdState(v);
  }, []);

  // Local sign-up -- creates a "profile" user object stored under the same
  // localStorage key as a Google sign-in. No backend, no real auth: this
  // browser is the only place this account exists. Useful for users who don't
  // want a Google account or for a quick first-run setup before they wire
  // OAuth properly.
  const signUpLocal = useCallback(({ name, email }) => {
    const n = (name || '').trim();
    const e = (email || '').trim();
    if (!n || !e || !/^.+@.+\..+$/.test(e)) {
      setError('Enter a name and a valid email address.');
      return false;
    }
    const u = {
      sub: 'local-' + Math.random().toString(36).slice(2, 12),
      email: e,
      email_verified: false,
      name: n,
      given_name: n.split(' ')[0],
      picture: '',
      provider: 'local',
      iat: Math.floor(Date.now() / 1000),
    };
    localStorage.setItem('hdg-g-user', JSON.stringify(u));
    setUser(u);
    setError(null);
    return true;
  }, []);

  return { clientId, setClientId, user, error, promptSignIn, renderButton, signOut, signUpLocal };
}
