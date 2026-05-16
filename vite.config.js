import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server pins port 5183 so OAuth redirect URIs registered with
// `http://127.0.0.1:5183/` keep working across the Babel-to-Vite migration.
// strictPort: hard-fail if the port is occupied (rather than silently picking
// the next one and breaking every OAuth flow registered at 5183).
//
// host: '127.0.0.1' -- Spotify rejects `localhost` as a redirect-URI host,
// and Vite's default `host` flips to '0.0.0.0' which advertises localhost in
// the console. Pinning to 127.0.0.1 keeps the dev URL identical to what's
// registered with the OAuth providers.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5183,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
