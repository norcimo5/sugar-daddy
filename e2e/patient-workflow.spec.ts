import { expect, test } from '@playwright/test';
import {
  gotoTab,
  logGlucose,
  newProjectPage,
  openApp,
  readDownload,
  waitForServiceWorkerControl,
} from './helpers';

const row = (value: string) => new RegExp(`^${value} mg/dL,`);

test.describe('patient workflow', () => {
  test('first launch, log, view, edit and delete', async ({ page }) => {
    // 1. Fresh context = empty database → welcome card.
    await page.goto('/');
    const welcome = page.getByTestId('welcome');
    await expect(welcome).toBeVisible();
    await expect(welcome.locator('.disclaimer')).toContainText('does not provide medical advice');
    await expect(page.getByText('No glucose readings yet.')).toBeVisible();
    await welcome.getByRole('button', { name: 'Got it' }).click();
    await expect(welcome).toBeHidden();

    // 2. Common path: tap Log glucose, type a value, Save. Measure it.
    const started = Date.now();
    await page.getByTestId('log-glucose').click();
    await page.getByLabel(/^Glucose in /).fill('123');
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast')).toContainText('Reading saved.');
    const elapsed = Date.now() - started;
    test.info().annotations.push({ type: 'log-path-ms', description: String(elapsed) });
    expect(elapsed).toBeLessThan(10_000);

    // 3. Visible on Today and in History.
    await expect(page.getByTestId('latest-value')).toContainText('123');
    await expect(
      page.getByTestId('today-list').getByRole('button', { name: row('123') }),
    ).toBeVisible();
    await gotoTab(page, 'History');
    await expect(page.getByTestId('history-count')).toHaveText('1 reading');
    await expect(
      page.getByTestId('history-list').getByRole('button', { name: row('123') }),
    ).toBeVisible();

    // 4. Edit it from Today.
    await gotoTab(page, 'Today');
    await page
      .getByTestId('today-list')
      .getByRole('button', { name: row('123') })
      .click();
    await expect(page.getByRole('heading', { name: 'Edit glucose reading' })).toBeVisible();
    const input = page.getByLabel(/^Glucose in /);
    await expect(input).toHaveValue('123');
    await input.fill('131');
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast')).toContainText('Changes saved.');
    await expect(page.getByTestId('latest-value')).toContainText('131');
    await expect(
      page.getByTestId('today-list').getByRole('button', { name: row('123') }),
    ).toHaveCount(0);
    await gotoTab(page, 'History');
    await expect(
      page.getByTestId('history-list').getByRole('button', { name: row('131') }),
    ).toBeVisible();

    // Delete a second reading — must ask for confirmation first.
    await gotoTab(page, 'Today');
    await logGlucose(page, '98');
    await gotoTab(page, 'History');
    await expect(page.getByTestId('history-count')).toHaveText('2 readings');
    await page
      .getByTestId('history-list')
      .getByRole('button', { name: row('98') })
      .click();
    await page.getByRole('button', { name: 'Delete reading' }).click();
    const confirm = page.getByRole('alertdialog');
    await expect(confirm).toContainText('Delete this reading?');
    // Nothing deleted yet; "Keep it" backs out.
    await confirm.getByRole('button', { name: 'Keep it' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Delete reading' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page.getByTestId('toast')).toContainText('Reading deleted.');
    await expect(page.getByTestId('history-count')).toHaveText('1 reading');
    await expect(
      page.getByTestId('history-list').getByRole('button', { name: row('98') }),
    ).toHaveCount(0);
    await expect(
      page.getByTestId('history-list').getByRole('button', { name: row('131') }),
    ).toBeVisible();
  });

  test('export CSV and JSON backup, then restore into a new device', async ({
    page,
    browser,
  }, info) => {
    await openApp(page);
    await logGlucose(page, '142');
    await gotoTab(page, 'Settings');
    const data = page.getByTestId('data-settings');

    // CSV export.
    const [csvDl] = await Promise.all([
      page.waitForEvent('download'),
      data.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(csvDl.suggestedFilename()).toMatch(/^sugar-daddy-all-\d{4}-\d{2}-\d{2}\.csv$/);
    const csvRaw = await readDownload(csvDl);
    expect(csvRaw.startsWith('\uFEFF')).toBe(true); // BOM for spreadsheet apps
    const csv = csvRaw.replace(/^\uFEFF/, '');
    const lines = csv.split(/\r\n/).filter(Boolean);
    expect(lines[0]).toMatch(/^id,metric,field,value,unit,entered_as,/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain(',142,');
    expect(lines[1]).toContain('mg/dL');

    // JSON backup.
    const [jsonDl] = await Promise.all([
      page.waitForEvent('download'),
      data.getByRole('button', { name: 'Download backup (JSON)' }).click(),
    ]);
    expect(jsonDl.suggestedFilename()).toMatch(/^sugar-daddy-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const backupPath = info.outputPath('my-backup.json');
    await jsonDl.saveAs(backupPath);
    const backup = JSON.parse(await readDownload(jsonDl));
    expect(backup.format).toBe('sugar-daddy-backup');
    expect(JSON.stringify(backup)).toContain('142');
    await expect(page.getByTestId('backup-status')).toContainText('Last backup:');

    // 6. Restore into a brand-new context (empty database).
    const fresh = await newProjectPage(browser, info);
    try {
      const p2 = fresh.page;
      await openApp(p2);
      await expect(p2.getByText('No glucose readings yet.')).toBeVisible();
      await gotoTab(p2, 'Settings');
      await p2.getByTestId('restore-file').setInputFiles(backupPath);
      const preview = p2.getByTestId('restore-preview');
      await expect(preview).toContainText('my-backup.json');
      await expect(preview).toContainText('Contains 1 reading: 1 new, 0 already on this device.');
      await preview.getByRole('button', { name: /^Merge/ }).click();
      await expect(p2.getByTestId('toast')).toContainText('Backup merged.');
      await expect(preview).toBeHidden();
      await gotoTab(p2, 'History');
      await expect(
        p2.getByTestId('history-list').getByRole('button', { name: row('142') }),
      ).toBeVisible();
      await gotoTab(p2, 'Today');
      await expect(p2.getByTestId('latest-value')).toContainText('142');
    } finally {
      await fresh.context.close();
    }
  });

  test('offline reload keeps the app and saved data', async ({ page, context }) => {
    await openApp(page);
    await waitForServiceWorkerControl(page);
    await logGlucose(page, '111');

    await context.setOffline(true);
    try {
      await page.reload();
      await expect(page.getByTestId('log-glucose')).toBeVisible();
      await expect(page.getByTestId('latest-value')).toContainText('111');
      await expect(
        page.getByTestId('today-list').getByRole('button', { name: row('111') }),
      ).toBeVisible();

      // Logging and History still work offline.
      await logGlucose(page, '117');
      await expect(page.getByTestId('latest-value')).toContainText('117');
      await gotoTab(page, 'History');
      await expect(page.getByTestId('history-count')).toHaveText('2 readings');

      // A second offline reload still has both.
      await page.reload();
      await expect(page.getByTestId('history-count')).toHaveText('2 readings');
    } finally {
      await context.setOffline(false);
    }
  });
});

test.describe('reminders with a controlled clock', () => {
  // 15:00Z on 2026-06-15 is 11:00 EDT.
  test.use({ timezoneId: 'America/New_York', locale: 'en-US' });
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__SD_NOW__ = '2026-06-15T15:00:00.000Z';
    });
  });

  async function addReminder(page: import('@playwright/test').Page, time: string) {
    const card = page.getByTestId('reminder-settings');
    await card.getByLabel('Time').fill(time);
    await card.getByRole('button', { name: 'Add reminder' }).click();
    await expect(page.getByTestId('toast')).toContainText(`Reminder added for ${time}.`);
  }

  test('missed, due and next reminder indicators', async ({ page }) => {
    await openApp(page);
    await expect(page.locator('.date-line')).toContainText('June 15');
    await expect(page.getByTestId('next-reminder')).toContainText('No reminders set.');

    await gotoTab(page, 'Settings');
    await addReminder(page, '09:00'); // grace ended 10:00 → missed
    await addReminder(page, '10:30'); // grace ends 11:30 → due
    await addReminder(page, '14:00'); // upcoming
    const list = page.getByTestId('reminder-settings').getByRole('listitem');
    await expect(list).toHaveCount(3);

    await gotoTab(page, 'Today');
    const missed = page.getByTestId('missed-banner');
    await expect(missed).toHaveCount(1);
    await expect(missed).toContainText(/Missed glucose reading — 9:00\sAM/i);
    await expect(page.getByText(/Glucose reading due — 10:30\sAM/i)).toBeVisible();
    await expect(page.getByTestId('next-reminder')).toHaveText(
      /Next reminder: Today at 2:00\sPM · Glucose/,
    );

    // "Not needed" dismisses the missed slot.
    await missed.getByRole('button', { name: 'Not needed' }).click();
    await expect(page.getByTestId('toast')).toContainText('Marked as not needed.');
    await expect(page.getByTestId('missed-banner')).toHaveCount(0);

    // Logging now (11:00, inside the 10:30 slot's grace window) satisfies the due slot.
    await logGlucose(page, '120');
    await expect(page.getByText(/Glucose reading due — 10:30\sAM/i)).toHaveCount(0);
    await expect(page.getByTestId('missed-banner')).toHaveCount(0);

    // A backdated reading clears a missed slot: 08:00 reminder, reading at 08:10.
    await gotoTab(page, 'Settings');
    await addReminder(page, '08:00');
    await gotoTab(page, 'Today');
    await expect(page.getByTestId('missed-banner')).toHaveCount(1);
    await expect(page.getByTestId('missed-banner')).toContainText('8:00 AM');
    await page.getByTestId('missed-banner').getByRole('link', { name: 'Log now' }).click();
    await page.getByLabel(/^Glucose in /).fill('105');
    await page.getByRole('button', { name: 'Change time' }).click();
    await page.getByLabel('Date and time taken').fill('2026-06-15T08:10');
    await page.getByTestId('save').click();
    await expect(page.getByTestId('toast')).toContainText('Reading saved.');
    await expect(page.getByTestId('missed-banner')).toHaveCount(0);
    await expect(page.getByTestId('next-reminder')).toHaveText(
      /Next reminder: Today at 2:00\sPM · Glucose/,
    );

    // State survives a reload (dismissal + readings persisted).
    await page.reload();
    await expect(page.getByTestId('log-glucose')).toBeVisible();
    await expect(page.getByTestId('missed-banner')).toHaveCount(0);
  });
});

test.describe('accessibility basics', () => {
  test('inputs are labelled, targets are large, status is text', async ({ page }) => {
    await openApp(page);

    // Today: main button is a large touch target.
    const logBtn = page.getByTestId('log-glucose');
    const box = await logBtn.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);

    // Log screen: the value input has an accessible name.
    await logBtn.click();
    await expect(page.getByLabel(/^Glucose in mg\/dL$/)).toBeVisible();
    for (const el of await page.locator('main input, main select, main textarea').all()) {
      await expect(el).toHaveAccessibleName(/\S/);
    }
    const saveBox = await page.getByTestId('save').boundingBox();
    expect(saveBox?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: 'Cancel' }).click();

    // Settings: every form control has an accessible name.
    await gotoTab(page, 'Settings');
    const glucose = page.getByTestId('metric-settings-glucose');
    await glucose.getByText('Target range and alerts').click();
    for (const el of await page.locator('main input, main select, main textarea').all()) {
      await expect(el).toHaveAccessibleName(/\S/);
    }

    // Configure a clinician target range: 70–180 mg/dL.
    await glucose.getByLabel('Target range — low').fill('70');
    await glucose.getByLabel('Target range — high').fill('180');
    await glucose.getByRole('button', { name: 'Save glucose values' }).click();
    await expect(page.getByTestId('toast')).toContainText('Clinician values saved.');

    // A high reading shows its status as text, with plain (not playful) copy.
    await gotoTab(page, 'Today');
    await page.getByTestId('log-glucose').click();
    await page.getByLabel(/^Glucose in /).fill('250');
    await page.getByTestId('save').click();
    const toast = page.getByTestId('toast');
    await expect(toast).toHaveText('Reading saved.');
    await expect(toast).not.toContainText(/Daddy|Sweet/);
    await expect(page.getByTestId('live')).toHaveText('Reading saved.');
    await expect(page.locator('.latest').getByText('Above target range')).toBeVisible();
    await expect(
      page
        .getByTestId('today-list')
        .getByRole('button', { name: /^250 mg\/dL,.*Above target range/ }),
    ).toBeVisible();
  });
});
