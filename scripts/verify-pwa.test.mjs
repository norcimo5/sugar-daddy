import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPngSize, extractPrecacheList, verifyDist } from './verify-pwa.mjs';

/** Minimal PNG: signature + IHDR chunk (enough for header parsing). */
function fakePng(width, height) {
  const buf = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

const manifest = {
  name: 'Sugar Daddy',
  short_name: 'Sugar Daddy',
  description: 'Your glucose. Your rules.',
  start_url: '/',
  scope: '/',
  id: '/',
  display: 'standalone',
  theme_color: '#7a2e4f',
  background_color: '#fff6ef',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    {
      src: '/icons/icon-maskable-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'maskable',
    },
  ],
};

const html =
  '<html><head><link rel="manifest" href="/manifest.webmanifest" />' +
  '<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" /></head></html>';

describe('readPngSize', () => {
  it('reads width and height from the IHDR chunk', () => {
    expect(readPngSize(fakePng(192, 180))).toEqual({ width: 192, height: 180 });
  });

  it('returns null for non-PNG data', () => {
    expect(readPngSize(Buffer.from('GIF89a not a png at all, definitely'))).toBeNull();
  });
});

describe('extractPrecacheList', () => {
  it('parses the injected JSON list', () => {
    expect(extractPrecacheList('x;\nself.__PRECACHE__ = ["/","/index.html"];\n')).toEqual([
      '/',
      '/index.html',
    ]);
  });

  it('returns null when the assignment is missing', () => {
    expect(extractPrecacheList('const a = 1;')).toBeNull();
  });
});

describe('verifyDist', () => {
  let dist;

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'verify-pwa-'));
    mkdirSync(join(dist, 'icons'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify(manifest));
    writeFileSync(join(dist, 'icons/icon-192.png'), fakePng(192, 192));
    writeFileSync(join(dist, 'icons/icon-512.png'), fakePng(512, 512));
    writeFileSync(join(dist, 'icons/icon-maskable-512.png'), fakePng(512, 512));
    writeFileSync(join(dist, 'icons/apple-touch-icon-180.png'), fakePng(180, 180));
    writeFileSync(join(dist, 'assets/app.js'), '');
    writeFileSync(join(dist, 'index.html'), html);
    writeFileSync(
      join(dist, 'sw.js'),
      'self.__PRECACHE__ = ["/","/index.html","/assets/app.js"];\nconst BUILD_ID = "abc";\n',
    );
  });

  afterEach(() => rmSync(dist, { recursive: true, force: true }));

  const failures = (results) => results.filter((r) => !r.ok).map((r) => r.name);

  it('passes for a complete build', () => {
    expect(failures(verifyDist(dist))).toEqual([]);
  });

  it('passes for a sub-path build (GitHub Pages) with relative manifest URLs', () => {
    writeFileSync(
      join(dist, 'manifest.webmanifest'),
      JSON.stringify({
        ...manifest,
        start_url: './',
        scope: './',
        id: './',
        icons: manifest.icons.map((i) => ({ ...i, src: i.src.replace(/^\//, '') })),
      }),
    );
    writeFileSync(
      join(dist, 'index.html'),
      '<html><head><link rel="manifest" href="/sugar-daddy/manifest.webmanifest" />' +
        '<link rel="apple-touch-icon" href="/sugar-daddy/icons/apple-touch-icon-180.png" /></head></html>',
    );
    expect(failures(verifyDist(dist))).toEqual([]);
  });

  it('still fails when index.html links some other manifest', () => {
    writeFileSync(
      join(dist, 'index.html'),
      '<html><head><link rel="manifest" href="/other.json" />' +
        '<link rel="apple-touch-icon" href="/icons/apple-touch-icon-180.png" /></head></html>',
    );
    expect(failures(verifyDist(dist))).toEqual(['index.html links manifest']);
  });

  it('fails when an icon size does not match the declared sizes', () => {
    writeFileSync(join(dist, 'icons/icon-512.png'), fakePng(256, 256));
    expect(failures(verifyDist(dist)).join(' ')).toMatch(/icon-512/);
  });

  it('fails when a required manifest field is missing', () => {
    const rest = { ...manifest };
    delete rest.display;
    writeFileSync(join(dist, 'manifest.webmanifest'), JSON.stringify(rest));
    expect(failures(verifyDist(dist)).join(' ')).toMatch(/display/);
  });

  it('fails when the manifest is not valid JSON', () => {
    writeFileSync(join(dist, 'manifest.webmanifest'), '{nope');
    expect(failures(verifyDist(dist)).join(' ')).toMatch(/manifest/);
  });

  it('fails when the apple-touch-icon is not 180x180', () => {
    writeFileSync(join(dist, 'icons/apple-touch-icon-180.png'), fakePng(192, 192));
    expect(failures(verifyDist(dist)).join(' ')).toMatch(/apple-touch-icon/);
  });

  it('fails when the precache list is still the empty placeholder', () => {
    writeFileSync(join(dist, 'sw.js'), "self.__PRECACHE__ = [];\nconst BUILD_ID = 'dev';\n");
    expect(failures(verifyDist(dist)).join(' ')).toMatch(/precache/i);
  });

  it('fails when the precache list omits /index.html', () => {
    writeFileSync(join(dist, 'sw.js'), 'self.__PRECACHE__ = ["/","/assets/app.js"];\n');
    expect(failures(verifyDist(dist)).join(' ')).toMatch(/index\.html/);
  });

  it('fails when a precached file does not exist in dist', () => {
    unlinkSync(join(dist, 'assets/app.js'));
    expect(failures(verifyDist(dist)).join(' ')).toMatch(/assets\/app\.js/);
  });

  it('fails when index.html does not link the manifest and apple-touch-icon', () => {
    writeFileSync(join(dist, 'index.html'), '<html><head></head></html>');
    const names = failures(verifyDist(dist)).join(' ');
    expect(names).toMatch(/manifest/);
    expect(names).toMatch(/apple-touch-icon/);
  });
});
