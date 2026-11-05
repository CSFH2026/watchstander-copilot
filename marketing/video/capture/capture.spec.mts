import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

/**
 * Captures the real copilot screens the promo cut shows, at 2x, from a private server with a
 * throwaway audit log and the e2e stand-in board. Never point it at the demo server on :8000:
 * it acknowledges steps, sends a CASREP, and edits the log to show a tamper.
 * How to run it: marketing/README.md. The .mts names keep it out of the video typecheck.
 */

const BASE = process.env.CAPTURE_URL ?? 'http://127.0.0.1:8130';
const LOG = process.env.CAPTURE_AUDIT_PATH ?? '';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'screens');
const ASK = 'low lube oil pressure on number two SSGTG';

test.use({ baseURL: BASE, viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2, colorScheme: 'dark' });
test.setTimeout(180_000);

const shot = (page: Page, name: string) => page.screenshot({ path: join(OUT, `${name}.png`) });

async function open(page: Page, operator: string) {
  await page.request.post('/api/reset', { data: { operator_id: operator } });
  await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await page.goto('/');
  await expect(page.locator('.header')).not.toHaveAttribute('data-backend', 'checking');
  await page.getByLabel('Operator').selectOption(operator);
}

async function ask(page: Page, text: string, typed = false) {
  const box = page.getByPlaceholder(/^Describe the problem/);
  if (typed) await box.pressSequentially(text, { delay: 8 });
  else await box.fill(text);
  const answer = page.waitForResponse((r) => r.url().endsWith('/api/query') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await answer;
  await expect(page.locator('.result, .empty').first()).toBeVisible();
  await page.waitForTimeout(300);
}

async function ack(page: Page, seq: string) {
  const answer = page.waitForResponse((r) => r.url().endsWith('/api/action'));
  await page.getByRole('button', { name: `Acknowledge step ${seq}` }).click();
  await answer;
  await page.waitForTimeout(250);
}

test('copilot screens', async ({ page }) => {
  // Paper first, as EOOW-01, so the main run below stays a clean on-screen run.
  await open(page, 'EOOW-01');
  await ask(page, ASK);
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 1100, height: 1400 });
  await page.screenshot({ path: join(OUT, 'print-sheet.png'), fullPage: false });
  await page.emulateMedia({ media: 'screen' });
  await page.setViewportSize({ width: 1440, height: 810 });
  await page.getByRole('button', { name: 'Enter paper results' }).click();
  const form = page.locator('dialog.paper-modal[open]');
  for (const n of ['01', '02', '03']) await form.getByRole('checkbox', { name: new RegExp(`^${n} `) }).check();
  await form.locator('.paper-step').nth(0).getByLabel('Reading').fill('Low at LOCOP, EPCC agrees');
  await form.getByRole('button', { name: /^Sign and save 3 steps/ }).click();
  await expect(form).toContainText('3 of 3 steps saved');
  await shot(page, 'paper-saved');
  await form.getByRole('button', { name: 'Done' }).click();

  // Warm the search, so the first answer on screen shows the server's usual time, not a cold start.
  for (let i = 0; i < 3; i++) await page.request.post('/api/query', { data: { operator_id: 'EOOW-01', text: ASK } });
  await open(page, 'EOOW-02');
  await shot(page, 'home-chips');
  await page.getByPlaceholder(/^Describe the problem/).fill(ASK);
  await shot(page, 'ask-typed');
  await page.getByPlaceholder(/^Describe the problem/).fill('');
  await ask(page, ASK);
  await shot(page, 'result-top');
  await page.locator('.candidates').scrollIntoViewIfNeeded();
  await shot(page, 'result-candidates');
  await page.evaluate(() => window.scrollTo(0, 0));

  await ack(page, '01');
  await ack(page, '02');
  await ack(page, '05');
  await page.locator('.action-banner.blocked').scrollIntoViewIfNeeded();
  await shot(page, 'blocked-05');
  await ack(page, '03');
  await ack(page, '04');
  await page.locator('.step-list').scrollIntoViewIfNeeded();
  await shot(page, 'steps-04-done');

  await page.locator('.trust-strip').getByRole('button', { name: 'Verify log' }).click();
  await expect(page.locator('.trust-strip .verify-ok')).toHaveText('Chain intact');
  await page.locator('.trust-strip').scrollIntoViewIfNeeded();
  await shot(page, 'verify-ok');
  await page.getByRole('button', { name: 'Open log' }).click();
  await expect(page.locator('dialog.drawer[open]')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, 'log-drawer');
  await page.locator('dialog.drawer[open]').getByRole('button', { name: 'Close' }).click();

  // The CASREP comes before the tamper: Draft CASREP refuses a broken log.
  await page.getByRole('button', { name: 'Draft CASREP' }).click();
  const cr = page.locator('dialog[open]').filter({ has: page.locator('#casrep-title') });
  await expect(cr.locator('.casrep-facts')).toBeVisible();
  await page.waitForTimeout(400);
  await shot(page, 'casrep-draft');
  await cr.getByRole('button', { name: 'Send to CASREP Board' }).click();
  await expect(cr).toContainText('is on the board');
  await shot(page, 'casrep-sent');
  await cr.getByRole('button', { name: 'Close' }).click();

  // Known casualty: pull the board's open CASREPs (the server runs with WSC_CASREP_SYNC=0, so not
  // before now), then a fresh page and the same question again. The first chip is now the open CASREP's.
  await page.request.post(`${BASE}/api/casreps/refresh`);
  await open(page, 'EOOW-02');
  await expect(page.locator('.chip-board svg').first()).toBeVisible();
  await shot(page, 'home-chips-known');
  // The first question after a board pull is slower; ask once to warm it, so the shot shows the usual time.
  await ask(page, ASK);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await ask(page, ASK);
  await expect(page.getByRole('region', { name: 'Known casualties' })).toBeVisible();
  await shot(page, 'known-banner');

  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await ask(page, 'low lube oil pressure on number two SSDG');

  // Tamper: flip the first refusal to allowed, verify, then put the log back.
  if (LOG) {
    copyFileSync(LOG, `${LOG}.bak`);
    const text = readFileSync(LOG, 'utf8');
    writeFileSync(LOG, text.replace('"allowed": false', '"allowed": true').replace('"allowed":false', '"allowed":true'));
    await page.locator('.trust-strip').getByRole('button', { name: 'Verify log' }).click();
    await expect(page.locator('.trust-strip')).toContainText('Chain broken');
    await page.locator('.trust-strip').scrollIntoViewIfNeeded();
    await shot(page, 'verify-broken');
    copyFileSync(`${LOG}.bak`, LOG);
  }
});

// The vertical cut shows the phone-width layout: the copilot is responsive, so it is a real screen too.
test.describe('phone width', () => {
  test.use({ viewport: { width: 430, height: 760 }, deviceScaleFactor: 3 });

  test('copilot screens, phone width', async ({ page }) => {
    await open(page, 'EOOW-02');
    await ask(page, ASK);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator('.procedure').scrollIntoViewIfNeeded();
    await shot(page, 'm-result');
    await ack(page, '01');
    await ack(page, '02');
    await ack(page, '05');
    await page.locator('.action-banner.blocked').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(300);
    await shot(page, 'm-blocked-05');
    await page.evaluate(() => window.scrollTo(0, 0));
    if (LOG) {
      copyFileSync(LOG, `${LOG}.bak`);
      const text = readFileSync(LOG, 'utf8');
      writeFileSync(LOG, text.replace('"allowed": false', '"allowed": true').replace('"allowed":false', '"allowed":true'));
      await page.locator('.trust-strip').getByRole('button', { name: 'Verify log' }).click();
      await expect(page.locator('.trust-strip')).toContainText('Chain broken');
      await page.waitForTimeout(300);
      await shot(page, 'm-verify-broken');
      copyFileSync(`${LOG}.bak`, LOG);
    }
  });
});
