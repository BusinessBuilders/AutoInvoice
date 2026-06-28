#!/usr/bin/env node
/**
 * Generate printable, scannable crew-signup flyers (one SVG per active
 * business). The QR encodes the signup URL WITH the company's invite code as a
 * query param, so an employee scans → lands on /crew/signup with the code
 * already filled → just enters name/email/password.
 *
 * Usage: node scripts/make-crew-flyers.mjs [baseUrl]
 *   baseUrl defaults to https://accounting.business-builder.online
 */
import QRCode from 'qrcode';
import { Client } from 'pg';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'docs', 'crew-flyers');

const BASE_URL = process.argv[2] || 'https://accounting.business-builder.online';

function dbUrl() {
  const line = readFileSync(path.join(ROOT, 'apps', 'backend', '.env'), 'utf8')
    .split('\n')
    .find((l) => l.startsWith('DATABASE_URL='));
  return line.slice('DATABASE_URL='.length).trim();
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** QR as a base64 PNG data URI with a proper 4-module quiet zone, so it scans
 * reliably off a printed page (verified by decoding the library output). */
async function qrDataUri(text) {
  const buf = await QRCode.toBuffer(text, {
    type: 'png',
    margin: 4,
    width: 1000,
    errorCorrectionLevel: 'M',
    color: { dark: '#111827ff', light: '#ffffffff' },
  });
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** Letter-portrait flyer (850×1100 ≈ 8.5"×11" at 100dpi). */
function flyer({ companyName, code, qrUri }) {
  const W = 850, H = 1100;
  const box = 400;
  const qx = (W - box) / 2;
  const qy = 350;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial, sans-serif">
  <rect width="${W}" height="${H}" fill="#ffffff"/>
  <rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="24" fill="none" stroke="#16a34a" stroke-width="4"/>

  <!-- Header -->
  <text x="${W / 2}" y="120" text-anchor="middle" font-size="40">👷</text>
  <text x="${W / 2}" y="180" text-anchor="middle" font-size="46" font-weight="bold" fill="#111827">JOIN THE CREW</text>
  <text x="${W / 2}" y="232" text-anchor="middle" font-size="30" font-weight="bold" fill="#16a34a">${esc(companyName)}</text>
  <text x="${W / 2}" y="290" text-anchor="middle" font-size="22" fill="#6b7280">Scan to make your time-clock account</text>

  <!-- QR (embedded PNG with 4-module quiet zone) -->
  <rect x="${qx - 16}" y="${qy - 16}" width="${box + 32}" height="${box + 32}" rx="16" fill="#ffffff" stroke="#e5e7eb" stroke-width="2"/>
  <image x="${qx}" y="${qy}" width="${box}" height="${box}" href="${qrUri}" />

  <!-- Steps -->
  <text x="${W / 2}" y="${qy + box + 80}" text-anchor="middle" font-size="22" fill="#374151">
    <tspan font-weight="bold">1.</tspan> Open your phone camera
    <tspan dx="18" font-weight="bold">2.</tspan> Point at the code
    <tspan dx="18" font-weight="bold">3.</tspan> Tap the link
  </text>
  <text x="${W / 2}" y="${qy + box + 120}" text-anchor="middle" font-size="22" fill="#374151">
    Enter your name, email &amp; a password. That's it — you're on the clock.
  </text>

  <!-- Fallback URL + code -->
  <text x="${W / 2}" y="${H - 150}" text-anchor="middle" font-size="18" fill="#6b7280">Can't scan? Go to:</text>
  <text x="${W / 2}" y="${H - 122}" text-anchor="middle" font-size="20" font-weight="bold" fill="#2563eb">${esc(BASE_URL)}/crew/signup</text>
  <text x="${W / 2}" y="${H - 84}" text-anchor="middle" font-size="18" fill="#6b7280">and enter invite code:</text>
  <text x="${W / 2}" y="${H - 54}" text-anchor="middle" font-size="26" font-weight="bold" fill="#111827" font-family="monospace">${esc(code)}</text>
</svg>
`;
}

async function main() {
  const client = new Client({ connectionString: dbUrl() });
  await client.connect();
  const { rows } = await client.query(
    `SELECT id, name, "crewSignupCode" FROM "Company" WHERE active = true AND "crewSignupCode" IS NOT NULL ORDER BY name`
  );
  await client.end();

  mkdirSync(OUT_DIR, { recursive: true });
  for (const co of rows) {
    const url = `${BASE_URL}/crew/signup?code=${encodeURIComponent(co.crewSignupCode)}`;
    const qrUri = await qrDataUri(url);
    const svg = flyer({ companyName: co.name, code: co.crewSignupCode, qrUri });
    const file = path.join(OUT_DIR, `${co.id}-signup.svg`);
    writeFileSync(file, svg);
    console.log(`${co.name}: ${file}`);
    console.log(`  URL: ${url}`);
  }
}

main().catch((e) => {
  process.stderr.write(String(e?.stack ?? e) + '\n');
  process.exit(1);
});
