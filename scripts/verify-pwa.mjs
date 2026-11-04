#!/usr/bin/env node
// Verifies the built PWA in dist/: manifest, icon dimensions, service worker precache, index links.
// No dependencies. Exits non-zero when any check fails.
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const REQUIRED_FIELDS = [
  'name',
  'short_name',
  'description',
  'start_url',
  'scope',
  'id',
  'display',
  'theme_color',
  'background_color',
  'icons',
];
const APPLE_TOUCH_ICON = '/icons/apple-touch-icon-180.png';

/** @returns {{width: number, height: number} | null} */
export function readPngSize(buf) {
  if (buf.length < 24 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** @returns {string[] | null} */
export function extractPrecacheList(swSource) {
  const match = /self\.__PRECACHE__\s*=\s*(\[[^\n]*\]);/.exec(swSource);
  if (!match) return null;
  try {
    const list = JSON.parse(match[1]);
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

function distPath(dist, url) {
  const clean = url.split(/[?#]/)[0];
  return join(dist, clean === '/' ? 'index.html' : clean.replace(/^\//, ''));
}

/** @returns {{name: string, ok: boolean, detail?: string}[]} */
export function verifyDist(dist) {
  const results = [];
  const check = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

  // Manifest
  let manifest = null;
  const manifestPath = join(dist, 'manifest.webmanifest');
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    check('manifest.webmanifest parses', true);
  } catch (err) {
    check('manifest.webmanifest parses', false, err instanceof Error ? err.message : String(err));
  }
  if (manifest) {
    for (const field of REQUIRED_FIELDS) {
      const value = manifest[field];
      const present = Array.isArray(value) ? value.length > 0 : typeof value === 'string' && value;
      check(`manifest has "${field}"`, present);
    }
    const icons = Array.isArray(manifest.icons) ? manifest.icons : [];
    check(
      'manifest has a maskable icon',
      icons.some((i) => String(i.purpose ?? '').includes('maskable')),
    );
    for (const icon of icons) {
      const name = `icon ${icon.src} matches sizes ${icon.sizes}`;
      const file = distPath(dist, String(icon.src ?? ''));
      if (!existsSync(file)) {
        check(name, false, 'file missing');
        continue;
      }
      const size = readPngSize(readFileSync(file));
      const declared = String(icon.sizes ?? '').split(/\s+/);
      check(name, size && declared.includes(`${size.width}x${size.height}`), JSON.stringify(size));
    }
    // Screenshots (optional; Chrome shows them in the richer install dialog).
    for (const shot of Array.isArray(manifest.screenshots) ? manifest.screenshots : []) {
      const name = `screenshot ${shot.src} matches sizes ${shot.sizes}`;
      const file = distPath(dist, String(shot.src ?? ''));
      const size = existsSync(file) ? readPngSize(readFileSync(file)) : null;
      check(
        name,
        size && `${size.width}x${size.height}` === String(shot.sizes),
        JSON.stringify(size),
      );
    }
  }

  // Apple touch icon
  const appleFile = distPath(dist, APPLE_TOUCH_ICON);
  const appleSize = existsSync(appleFile) ? readPngSize(readFileSync(appleFile)) : null;
  check(
    `${APPLE_TOUCH_ICON} exists and is 180x180`,
    appleSize && appleSize.width === 180 && appleSize.height === 180,
    JSON.stringify(appleSize),
  );

  // Service worker
  const swPath = join(dist, 'sw.js');
  const list = existsSync(swPath) ? extractPrecacheList(readFileSync(swPath, 'utf8')) : null;
  check('sw.js precache list is non-empty', list && list.length > 0);
  if (list && list.length > 0) {
    check('sw.js precache includes /index.html', list.includes('/index.html'));
    const missing = list.filter((url) => !existsSync(distPath(dist, url)));
    for (const url of missing) check(`precached file exists: ${url}`, false, 'missing in dist');
    if (missing.length === 0) check(`all ${list.length} precached files exist in dist`, true);
  }

  // index.html links
  const indexPath = join(dist, 'index.html');
  const html = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
  check(
    'index.html links manifest',
    // Any base path is fine (e.g. /sugar-daddy/ on GitHub Pages).
    /<link[^>]+rel=["']manifest["'][^>]+href=["'](?:\/[\w.-]+)*\/manifest\.webmanifest["']/.test(
      html,
    ),
  );
  check(
    'index.html links apple-touch-icon',
    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["'](?:\/[\w.-]+)*\/icons\/apple-touch-icon-180\.png["']/.test(
      html,
    ),
  );

  return results;
}

function main() {
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const dist = join(root, 'dist');
  const results = verifyDist(dist);
  for (const r of results) {
    const detail = !r.ok && r.detail ? ` (${r.detail})` : '';
    process.stdout.write(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${detail}\n`);
  }
  const failed = results.filter((r) => !r.ok).length;
  if (failed > 0) {
    console.error(`verify-pwa: ${failed} check(s) failed`);
    process.exit(1);
  }
  process.stdout.write(`verify-pwa: all ${results.length} checks passed\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
