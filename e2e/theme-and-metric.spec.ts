import { expect, test } from '@playwright/test';

test.describe('theme and per-measurement screen', () => {
  test('theme toggle switches, persists across reload, and Settings reflects it', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.goto('/#/settings');
    await expect(page.getByLabel('Appearance')).toHaveValue('dark');
    await page.getByLabel('Appearance').selectOption('system');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('log with context, open the measurement screen, tap a chart point', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Got it' }).click();
    await page.getByTestId('log-glucose').click();
    await page.getByLabel(/^Glucose in /).fill('128');
    await page.getByLabel(/When was it taken/).selectOption('after_meal');
    await page.getByTestId('save').click();
    await page.getByTestId('tile-glucose').getByRole('link').first().click();
    await expect(page.getByRole('heading', { name: 'Glucose', level: 2 })).toBeVisible();
    await expect(page.getByTestId('recent-list')).toContainText('After meal');
    await page.locator('.chart [role=button]').first().click();
    await expect(page.getByTestId('chart-tip')).toContainText('128');
    await expect(page.getByTestId('chart-tip')).toContainText('After meal');
    const add = page.getByTestId('add-record');
    await expect(add).toBeVisible();
    expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
