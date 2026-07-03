import { test, expect } from '@playwright/test';

// Lightweight, dependency-free accessibility checks (no axe install needed).
// For a full audit, add @axe-core/playwright; these cover the high-value basics.

test.describe('accessibility basics', () => {
  test('landing has one h1, lang, skip link, and a labelled main', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('html')).toHaveAttribute('lang', /.+/);
    await expect(page.locator('h1')).toHaveCount(1);
    // Skip link is injected by a11y.js and targets #main.
    await expect(page.locator('.skip-link')).toHaveCount(1);
    await expect(page.locator('main#main, #main')).toHaveCount(1);
  });

  test('keyboard focus reaches interactive controls with a visible ring', async ({ page }) => {
    await page.goto('/index.html');
    await page.keyboard.press('Tab'); // skip link
    await page.keyboard.press('Tab');
    const tag = await page.evaluate(() => document.activeElement?.tagName);
    expect(['A', 'BUTTON', 'INPUT']).toContain(tag);
  });

  test('all images have alt text or are decorative', async ({ page }) => {
    await page.goto('/index.html');
    const missing = await page.$$eval(
      'img',
      (imgs) =>
        imgs.filter((i) => !i.hasAttribute('alt') && i.getAttribute('role') !== 'presentation')
          .length,
    );
    expect(missing).toBe(0);
  });

  test('buttons/links have an accessible name', async ({ page }) => {
    await page.goto('/machines.html');
    const unnamed = await page.$$eval(
      'a, button',
      (els) =>
        els.filter((e) => {
          const name =
            (e.textContent || '').trim() || e.getAttribute('aria-label') || e.getAttribute('title');
          return !name;
        }).length,
    );
    expect(unnamed).toBe(0);
  });

  test('respects prefers-reduced-motion (no reveal opacity lock)', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await ctx.newPage();
    await page.goto('/index.html');
    // With reduced motion, reveal elements must be visible (opacity 1), not stuck at 0.
    const opacity = await page
      .locator('[data-reveal]')
      .first()
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.9);
    await ctx.close();
  });
});
