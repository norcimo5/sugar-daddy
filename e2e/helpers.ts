import {
  expect,
  type Browser,
  type BrowserContextOptions,
  type Download,
  type Page,
  type TestInfo,
} from '@playwright/test';

/** Context options for a manual `browser.newContext()` that match the current project. */
export function projectContextOptions(info: TestInfo, extra: BrowserContextOptions = {}) {
  const u = info.project.use as Record<string, unknown>;
  const keys = [
    'baseURL',
    'viewport',
    'screen',
    'userAgent',
    'deviceScaleFactor',
    'isMobile',
    'hasTouch',
    'locale',
    'timezoneId',
  ] as const;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (u[k] !== undefined) out[k] = u[k];
  return { ...out, acceptDownloads: true, ...extra } as BrowserContextOptions;
}

export async function newProjectPage(browser: Browser, info: TestInfo) {
  const context = await browser.newContext(projectContextOptions(info));
  const page = await context.newPage();
  return { context, page };
}

/** Opens the app and dismisses the first-run welcome card if it is showing. */
export async function openApp(page: Page, hash = '#/') {
  await page.goto(`/${hash}`);
  await expect(page.getByTestId('log-glucose')).toBeVisible();
  const welcome = page.getByTestId('welcome');
  if (await welcome.isVisible()) {
    await welcome.getByRole('button', { name: 'Got it' }).click();
    await expect(welcome).toBeHidden();
  }
}

/** Logs a glucose reading "now" from the Today screen. Returns to Today. */
export async function logGlucose(page: Page, value: string) {
  await page.getByTestId('log-glucose').click();
  const input = page.getByLabel(/^Glucose in /);
  await expect(input).toBeVisible();
  await input.fill(value);
  await page.getByTestId('save').click();
  await expect(page.getByTestId('toast')).toContainText('Reading saved.');
  await expect(page.getByTestId('log-glucose')).toBeVisible();
}

export async function gotoTab(page: Page, name: 'Today' | 'History' | 'Trends' | 'Settings') {
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name }).click();
}

/** Waits until a service worker is active and controls this page (reloading once if needed). */
export async function waitForServiceWorkerControl(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
  if (!controlled) {
    await page.reload();
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
  }
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
}

/**
 * Reads a download as UTF-8 text without Node built-ins (the repo has no @types/node).
 * Keeps a leading BOM so tests can assert it.
 */
export async function readDownload(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  const parts: Uint8Array[] = [];
  for await (const chunk of stream) parts.push(chunk as Uint8Array);
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    all.set(p, at);
    at += p.length;
  }
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(all);
}
