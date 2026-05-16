// Web Crypto + IndexedDB token vault.
//
// localStorage on a wall tablet is the unspoken default token store for this
// kind of app, and it's the wrong default: any guest can open DevTools and
// read your Spotify refresh token in plain text. This module replaces that
// pattern with AES-GCM encrypted entries keyed off a per-browser key that
// itself lives in IndexedDB (not in JS memory, not in localStorage).
//
// Threat model: protects against casual local inspection ("guest grabs the
// tablet, opens DevTools"). Does NOT protect against malware on the device
// (anything that runs as the same origin can call this module's `get` and
// retrieve plaintext). For LAN-served household appliances that is the
// right tradeoff -- meaningful improvement, no operational cost.
//
// API:
//   await setSecret(name, value)    // value can be any JSON-serializable
//   await getSecret(name)            // returns value or null
//   await deleteSecret(name)
//   await listSecrets()              // names only (for debugging)

const DB_NAME    = 'hdg-secure-v1';
const STORE      = 'kv';
const META_STORE = 'meta';
const META_KEY   = 'aes-key-jwk';

// ---- Tiny IDB promise wrapper -----------------------------------------------

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

function txGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => reject(req.error);
  });
}

function txPut(db, storeName, key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

function txDelete(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

function txKeys(db, storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAllKeys();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror   = () => reject(req.error);
  });
}

// ---- Key management ---------------------------------------------------------

// Memoized once per page load. The JWK lives in IndexedDB; the imported
// CryptoKey is non-extractable and pinned to this module's closure.
let _keyPromise = null;

async function getOrCreateKey() {
  if (_keyPromise) return _keyPromise;
  _keyPromise = (async () => {
    const db = await openDb();
    let jwk = await txGet(db, META_STORE, META_KEY);
    if (!jwk) {
      const newKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable -- so we can JWK-export and persist it
        ['encrypt', 'decrypt']
      );
      jwk = await crypto.subtle.exportKey('jwk', newKey);
      await txPut(db, META_STORE, META_KEY, jwk);
    }
    return crypto.subtle.importKey('jwk', jwk, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  })();
  return _keyPromise;
}

// ---- Encrypt / decrypt ------------------------------------------------------

async function encryptJSON(value) {
  const key = await getOrCreateKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const pt  = new TextEncoder().encode(JSON.stringify(value));
  const ct  = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
  return { v: 1, iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)) };
}

async function decryptJSON(blob) {
  if (!blob || blob.v !== 1 || !blob.iv || !blob.ct) return null;
  const key = await getOrCreateKey();
  try {
    const pt = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(blob.iv) },
      key,
      new Uint8Array(blob.ct)
    );
    return JSON.parse(new TextDecoder().decode(pt));
  } catch (e) {
    // Corrupted entry, wrong key, etc. Returning null lets callers fall back
    // to "not set" gracefully rather than blowing up the auth flow.
    return null;
  }
}

// ---- Public API -------------------------------------------------------------

export async function setSecret(name, value) {
  const blob = await encryptJSON(value);
  const db   = await openDb();
  await txPut(db, STORE, name, blob);
}

export async function getSecret(name) {
  const db   = await openDb();
  const blob = await txGet(db, STORE, name);
  if (!blob) return null;
  return decryptJSON(blob);
}

export async function deleteSecret(name) {
  const db = await openDb();
  await txDelete(db, STORE, name);
}

export async function listSecrets() {
  const db = await openDb();
  return txKeys(db, STORE);
}

// ---- One-shot migration from legacy localStorage ----------------------------
//
// Older builds stored these keys in localStorage:
//   hdg-sp-token       -> Spotify access/refresh tokens   (sensitive)
//   hdg-g-credential   -> Google JWT credential           (sensitive)
//   hdg-integrations   -> Plejd token + Tibber token blob (sensitive)
//
// On first run after the Vite migration, copy them into the secure store
// and clear the originals. Idempotent: a flag in IDB marks completion.

const MIGRATION_FLAG = '__migrated_from_localstorage_v1__';

const MIGRATE_KEYS = [
  { src: 'hdg-sp-token',     dst: 'spotify.token' },
  { src: 'hdg-g-credential', dst: 'google.credential' },
  { src: 'hdg-integrations', dst: 'integrations.config' },
];

export async function migrateFromLocalStorage() {
  try {
    const db = await openDb();
    const done = await txGet(db, META_STORE, MIGRATION_FLAG);
    if (done) return { migrated: false, reason: 'already migrated' };
    let count = 0;
    for (const { src, dst } of MIGRATE_KEYS) {
      const raw = localStorage.getItem(src);
      if (raw == null) continue;
      try {
        const value = JSON.parse(raw);
        await setSecret(dst, value);
        // We deliberately keep the legacy localStorage entries in place for
        // one release cycle so an interrupted migration is recoverable. A
        // later release can delete them outright.
        count++;
      } catch (e) {
        // Non-JSON value (shouldn't happen for these keys) -- skip rather
        // than block the migration on a single bad entry.
      }
    }
    await txPut(db, META_STORE, MIGRATION_FLAG, { at: Date.now(), count });
    return { migrated: true, count };
  } catch (e) {
    // IndexedDB or Web Crypto unavailable (very old browser, private mode in
    // some Firefox configs). Caller can fall back to legacy localStorage.
    return { migrated: false, error: String(e?.message || e) };
  }
}
