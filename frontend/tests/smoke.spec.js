import { test, expect } from '@playwright/test';

const PAGES = [
  'index.html',
  'upload.html',
  'options.html',
  'auth.html',
  'pay.html',
  'success.html',
  'dashboard.html',
  'profile.html',
  'pricing.html',
  'machines.html',
  'how-it-works.html',
  'about.html',
  'contact.html',
  'faq.html',
  '404.html',
  'offline.html',
];

test.describe('smoke — every page renders without console errors', () => {
  for (const page of PAGES) {
    test(`loads ${page}`, async ({ page: pw }) => {
      const errors = [];
      pw.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
      });
      pw.on('pageerror', (err) => errors.push(String(err)));

      const res = await pw.goto('/' + page, { waitUntil: 'networkidle' });
      expect(res?.status(), `${page} HTTP status`).toBeLessThan(400);

      // Chrome mounts (nav + footer) on chrome-bearing pages.
      if (!['404.html', 'offline.html'].includes(page)) {
        await expect(pw.locator('#nav .brand, header .brand').first()).toBeVisible();
      }

      // Ignore benign cross-origin/network noise (no API/DB in CI); fail on real JS errors.
      const real = errors.filter(
        (e) => !/Failed to load resource|net::ERR|CORS|401|403|500|favicon/i.test(e),
      );
      expect(real, `console errors on ${page}:\n${real.join('\n')}`).toHaveLength(0);
    });
  }
});

test('theme toggle switches data-theme', async ({ page }) => {
  await page.goto('/index.html');
  const before = await page.locator('html').getAttribute('data-theme');
  await page.locator('.theme-toggle').first().click();
  const after = await page.locator('html').getAttribute('data-theme');
  expect(after).not.toBe(before);
});

test('landing has canonical + manifest + CSP', async ({ page }) => {
  await page.goto('/index.html');
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
});
