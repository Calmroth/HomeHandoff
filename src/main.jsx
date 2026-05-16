// Vite entry. Mounts the App and wires the Phase-0 foundation:
//   - imports the CSS so HMR picks up token edits
//   - installs cross-tab BroadcastChannel sync
//   - migrates legacy localStorage tokens into encrypted IndexedDB once
// Everything else lives in App.jsx; keep this file tiny so the boot path is
// obvious and reorderable.
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './tokens.css';
import { installCrossTabSync } from './store/sync.js';
import { installLanWatchdog } from './store/lanWatchdog.js';
import { migrateFromLocalStorage } from './lib/secureStore.js';

// Cross-tab state sync + LAN watchdog. Both return teardown functions held
// for HMR so we don't accumulate listeners across hot reloads.
let teardownSync     = installCrossTabSync();
let teardownWatchdog = installLanWatchdog();
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try { teardownSync?.(); } catch (e) {}
    try { teardownWatchdog?.(); } catch (e) {}
  });
}

// Best-effort migration of legacy localStorage tokens into the secure IDB
// vault. Fire-and-forget: if it fails, the legacy localStorage hooks keep
// working unchanged. We don't await -- mounting the UI is the priority.
migrateFromLocalStorage().then((r) => {
  if (r?.migrated) console.info(`[hdg] migrated ${r.count} secret(s) into encrypted IndexedDB`);
}).catch(() => {});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
