/**
 * One-shot diagnostic: hits the live Plejd API and dumps the exact field
 * structure so we can see what rooms/devices/outputSettings actually look like.
 * Run: node server/scripts/plejd-probe.mjs
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const dir = join(fileURLToPath(import.meta.url), '..', '..', '..');
const raw = readFileSync(join(dir, '.env.local'), 'utf8');
const env = {};
for (const line of raw.split('\n')) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const eq = t.indexOf('=');
  if (eq < 0) continue;
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
}

const EMAIL    = env.PLEJD_EMAIL;
const PASSWORD = env.PLEJD_PASSWORD;
const SITE_ID  = env.PLEJD_SITE_ID;
const APP_ID   = 'zHtVqXt8k4yFyk2QGmgp48D9xZr2G94xWYnF4dak';
const BASE     = 'https://cloud.plejd.com';

if (!EMAIL || !PASSWORD) { console.error('PLEJD_EMAIL / PLEJD_PASSWORD not set in .env.local'); process.exit(1); }

function h(tok) {
  const hdr = { 'X-Parse-Application-Id': APP_ID, 'Content-Type': 'application/json' };
  if (tok) hdr['X-Parse-Session-Token'] = tok;
  return hdr;
}

console.log('--- 1. Login ---');
const loginRes = await fetch(`${BASE}/parse/login`, {
  method: 'POST', headers: h(), body: JSON.stringify({ username: EMAIL, password: PASSWORD }),
});
const login = await loginRes.json();
if (!login.sessionToken) { console.error('Login failed:', login); process.exit(1); }
const token = login.sessionToken;
console.log('OK token acquired\n');

let siteId = SITE_ID;
if (!siteId) {
  console.log('--- 2. getSiteList ---');
  const sl = await fetch(`${BASE}/parse/functions/getSiteList`, {
    method: 'POST', headers: h(token), body: '{}',
  });
  const slj = await sl.json();
  const first = (slj.result || [])[0];
  const s = first?.site || first;
  siteId = s?.siteId || s?.objectId;
  console.log('siteId:', siteId, '\n');
}

console.log('--- 3. getSiteById ---');
const siteRes = await fetch(`${BASE}/parse/functions/getSiteById`, {
  method: 'POST', headers: h(token), body: JSON.stringify({ siteId }),
});
const siteJ = await siteRes.json();
const detail = (Array.isArray(siteJ.result) ? siteJ.result[0] : siteJ.result) || siteJ;

console.log('Top-level keys:', Object.keys(detail));
console.log('\nrooms (first 2):');
(detail.rooms || []).slice(0, 2).forEach((r, i) => console.log(`  rooms[${i}]:`, JSON.stringify(r)));
console.log('\nplejdDevices (first 2):');
(detail.plejdDevices || []).slice(0, 2).forEach((d, i) => console.log(`  plejdDevices[${i}]:`, JSON.stringify(d)));
if (detail.outputSettings) {
  const arr = Array.isArray(detail.outputSettings) ? detail.outputSettings : [detail.outputSettings];
  console.log('\ntop-level outputSettings (first 2):');
  arr.slice(0, 2).forEach((o, i) => console.log(`  outputSettings[${i}]:`, JSON.stringify(o)));
}
console.log('\n--- 4. GET /parse/classes/Room (no filter) ---');
const roomsRes = await fetch(`${BASE}/parse/classes/Room`, { headers: h(token) });
const roomsJ   = await roomsRes.json();
console.log('results count:', (roomsJ.results || []).length);
(roomsJ.results || []).slice(0, 2).forEach((r, i) => console.log(`  Room[${i}]:`, JSON.stringify(r)));

console.log('\n--- 5. GET /parse/classes/Room?where=site pointer ---');
const where5 = encodeURIComponent(JSON.stringify({ site: { __type: 'Pointer', className: 'Installation', objectId: siteId } }));
const rooms5Res = await fetch(`${BASE}/parse/classes/Room?where=${where5}`, { headers: h(token) });
const rooms5J   = await rooms5Res.json();
console.log('results count:', (rooms5J.results || []).length);
(rooms5J.results || []).slice(0, 2).forEach((r, i) => console.log(`  Room[${i}]:`, JSON.stringify(r)));

console.log('\n--- 6. GET /parse/classes/Room?where=siteId ---');
const where6 = encodeURIComponent(JSON.stringify({ siteId }));
const rooms6Res = await fetch(`${BASE}/parse/classes/Room?where=${where6}`, { headers: h(token) });
const rooms6J   = await rooms6Res.json();
console.log('results count:', (rooms6J.results || []).length);
(rooms6J.results || []).slice(0, 2).forEach((r, i) => console.log(`  Room[${i}]:`, JSON.stringify(r)));
