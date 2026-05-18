import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';

// ----------------------------------------------------------------------------
// Two dev modes:
//
//   1. Default (npm run dev)
//      Host: 127.0.0.1   Protocol: http   Port: 5183
//      Why HTTP works: 127.0.0.1 / localhost / [::1] are
//      *automatically a secure context* in every browser, so Wake Lock /
//      MediaSession / Geolocation / Service Workers all work without TLS.
//      Plus: the embedded preview tool can attach without cert wrangling.
//
//   2. LAN mode (npm run dev:lan, or VITE_HTTPS=1)
//      Host: 0.0.0.0     Protocol: https  Port: 5183
//      vite-plugin-mkcert generates a per-machine local CA and a cert valid
//      for 127.0.0.1, localhost, and homedomain.local. The first run prompts
//      for admin to install the root CA in the OS trust store, then any
//      device that ALSO installs the same root CA (see SETUP_CERT.md) gets
//      a fully trusted padlock at https://<lan-ip>:5183/. This is the path
//      the council required for kiosk / LAN-shared scenarios.
//
//   Production builds (`npm run build`) don't use either of the above --
//   deploy to a host that gives HTTPS (Netlify / Vercel / Cloudflare Pages)
//   or terminate TLS at a reverse proxy. See SETUP_CERT.md for the cloud
//   deploy + LAN-integrations mixed-content workaround.
// ----------------------------------------------------------------------------

const httpsMode = process.env.VITE_HTTPS === '1' || process.env.VITE_HTTPS === 'true';
const host = process.env.VITE_HOST || (httpsMode ? '0.0.0.0' : '127.0.0.1');

export default defineConfig({
  plugins: [
    react(),
    // mkcert plugin only loads when HTTPS mode is requested. Loading it in
    // localhost dev would force HTTPS the preview tool's Chrome doesn't trust
    // (its trust store is sandboxed and separate from the OS), and we'd lose
    // the dev preview for no gain (localhost is already a secure context).
    ...(httpsMode ? [mkcert({
      hosts: ['127.0.0.1', 'localhost', 'homedomain.local'],
    })] : []),
  ],
  server: {
    host,
    port: 5183,
    strictPort: true,
    // Dev-time CORS workaround for Plejd's cloud API.
    // Plejd's parse-server endpoints at api.plejd.com don't send CORS headers,
    // so a browser fetch hits a wall. Vite's proxy intercepts /api/plejd/* and
    // forwards to api.plejd.com, returning the response back to the browser
    // with same-origin semantics. The X-Parse-Application-Id is the public
    // Plejd Parse app ID -- it's effectively a constant from their mobile app,
    // not a secret.
    //
    // For production deployment you'll need an equivalent reverse-proxy (one
    // Netlify Function / Cloudflare Worker / nginx location block) -- see
    // SETUP_CERT.md.
    
    proxy: {
      // Plejd cloud API — login, site list, device discovery, sendStateToDevice.
      // All routes through cloud.plejd.com (Parse server).
      // sendStateToDevice routes commands to the GWY-01 via its persistent
      // Plejd-cloud connection; the GWY-01 executes the BLE command locally.
      '/api/plejd': {
        target: 'https://cloud.plejd.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/plejd/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
