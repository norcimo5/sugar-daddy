import { expect, test, type APIRequestContext } from '@playwright/test';
import { gotoTab, openApp, waitForServiceWorkerControl } from './helpers';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

async function pngSize(request: APIRequestContext, src: string) {
  const res = await request.get(src);
  expect(res.status(), src).toBe(200);
  expect(res.headers()['content-type']).toContain('image/png');
  const buf = await res.body();
  expect([...buf.subarray(0, 8)], `${src} PNG signature`).toEqual(PNG_SIGNATURE);
  expect(buf.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

test.describe('PWA', () => {
  test('manifest parses and declares standalone install fields', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBe('/manifest.webmanifest');
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    const m = await res.json();
    expect(m.name).toBe('Sugar Daddy');
    expect(m.short_name).toBeTruthy();
    expect(m.start_url).toBe('/');
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');
    expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(m.background_color).toMatch(/^#[0-9a-f]{6}$/i);
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(m.icons.some((i: { purpose?: string }) => i.purpose?.includes('maskable'))).toBe(true);
  });

  test('icons exist with the declared dimensions', async ({ page, request }) => {
    const m = await (await request.get('/manifest.webmanifest')).json();
    for (const icon of m.icons as { src: string; sizes: string }[]) {
      const { width, height } = await pngSize(request, icon.src);
      expect(`${width}x${height}`, icon.src).toBe(icon.sizes);
    }
    await page.goto('/');
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect(await pngSize(request, apple!)).toEqual({ width: 180, height: 180 });
    const fav = page.locator('link[rel="icon"]');
    const favSize = await fav.getAttribute('sizes');
    const { width, height } = await pngSize(request, (await fav.getAttribute('href'))!);
    expect(`${width}x${height}`).toBe(favSize);
    // The header logo actually renders.
    await expect
      .poll(() =>
        page.locator('.app-header img').evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBe(192);
  });

  test('HTML head: viewport, CSP, theme colour, standalone meta', async ({ page }) => {
    await page.goto('/');
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toContain('width=device-width');
    expect(viewport).toContain('initial-scale=1');
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\D|$)/);
    const csp = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(await page.locator('meta[name="theme-color"]').count()).toBeGreaterThan(0);
    expect(await page.locator('meta[name="theme-color"]').first().getAttribute('content')).toMatch(
      /^#[0-9a-f]{6}$/i,
    );
    expect(
      await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content'),
    ).toBe('yes');
    expect(await page.locator('html').getAttribute('lang')).toBe('en');
    // No horizontal scroll at phone width.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('service worker installs, activates and controls the page', async ({ page }) => {
    await page.goto('/');
    await waitForServiceWorkerControl(page);
    const info = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const keys = await caches.keys();
      const cache = keys.length ? await caches.open(keys[0]!) : null;
      const cached = cache ? (await cache.keys()).map((r) => new URL(r.url).pathname) : [];
      return {
        scope: reg?.scope,
        state: reg?.active?.state,
        script: reg?.active?.scriptURL,
        keys,
        cached,
      };
    });
    expect(info.state).toBe('activated');
    expect(info.scope).toMatch(/\/$/);
    expect(info.script).toMatch(/\/sw\.js$/);
    expect(info.keys.some((k) => k.startsWith('sugar-daddy-') && k !== 'sugar-daddy-dev')).toBe(
      true,
    );
    expect(info.cached).toContain('/index.html');
    expect(info.cached).toContain('/manifest.webmanifest');
    expect(info.cached.some((p) => /^\/assets\/.+\.js$/.test(p))).toBe(true);
  });

  test('no console errors and no requests to other origins', async ({ page }) => {
    const errors: string[] = [];
    const foreign: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('request', (req) => {
      const url = new URL(req.url());
      if (['blob:', 'data:'].includes(url.protocol)) return;
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') foreign.push(req.url());
    });

    await openApp(page);
    await waitForServiceWorkerControl(page);
    for (const tab of ['History', 'Trends', 'Settings', 'Today'] as const) {
      await gotoTab(page, tab);
      await expect(page.locator('main h2')).toHaveCount(1);
    }
    await page.goto('/#/about');
    await expect(page.getByTestId('version')).toBeVisible();
    await expect(page.getByTestId('disclaimer')).toContainText('does not provide medical advice');
    await page.reload();
    await expect(page.locator('main h2')).toHaveCount(1);

    expect(errors).toEqual([]);
    expect(foreign).toEqual([]);
  });
});
