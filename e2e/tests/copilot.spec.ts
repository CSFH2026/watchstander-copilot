import { COVERED, OFF_TOPIC, OPERATOR, acknowledge, ask, expect, isRemote, test } from './fixtures';

test('the backend serves the ddg doctrine and the badge says where it runs', async ({ app, request }) => {
  const health = await (await request.get('/api/health')).json();
  expect(health.dataset.name).toBe('ddg');
  expect(health.procedures).toBe(102);
  expect(health.steps).toBe(771);
  await expect(app.locator('.header .badge')).toHaveText(isRemote ? 'Cloud test' : 'Offline');
});

test('every example question finds a procedure', async ({ app, request }) => {
  const { dataset } = await (await request.get('/api/health')).json();
  for (const example of dataset.examples as string[]) {
    const answer = app.waitForResponse((r) => r.url().endsWith('/api/query'));
    await app.getByRole('group', { name: 'Example questions' }).getByRole('button', { name: example, exact: true }).click();
    const body = await (await answer).json();
    expect(body.procedure, example).not.toBeNull();
    await expect(app.locator('#proc-title')).toHaveText(body.procedure.title);
  }
});

test('a covered question finds its procedure with every step', async ({ app }) => {
  const body = await ask(app, COVERED.text);
  expect((body.procedure as { procedure_id: string }).procedure_id).toBe(COVERED.procedure);
  await expect(app.locator('.proc-id')).toHaveText(COVERED.procedure);
  await expect(app.locator('.step-list > li')).toHaveCount(COVERED.steps);
  await expect(app.locator('.step-list > li').first()).toHaveClass(/step-next/);
});

test('an off-topic question is refused, not guessed', async ({ app }) => {
  const body = await ask(app, OFF_TOPIC);
  expect(body.procedure).toBeNull();
  await expect(app.getByText('No authorized procedure matches this description.')).toBeVisible();
});

test('steps are acknowledged in order, and a step out of order is blocked', async ({ app }) => {
  await ask(app, COVERED.text);
  const first = await acknowledge(app, '01');
  expect(first.allowed).toBe(true);
  await expect(app.locator('.step-list > li').first()).toHaveClass(/step-done/);

  const skipped = await acknowledge(app, '03');
  expect(skipped.allowed).toBe(false);
  await expect(app.locator('.action-banner.blocked')).toContainText('requires step 02');
  await expect(app.locator('.step-list > li').nth(2)).toHaveClass(/step-locked/);
});

test('the audit log verifies, and an entry opens with its proof', async ({ app }) => {
  await ask(app, COVERED.text);
  const ack = await acknowledge(app, '01');
  const seq = (ack.audit as { seq: number }).seq;

  await app.getByRole('button', { name: 'Verify log' }).first().click();
  await expect(app.locator('.trust-strip .verify-ok')).toHaveText('Chain intact');

  await app.getByRole('button', { name: 'Open log' }).click();
  await expect(app.locator('dialog.drawer[open]')).toBeVisible();
  await app.getByRole('button', { name: 'Close' }).click();

  // The action banner links to the entry on every backend.
  await app.locator('.action-banner').getByRole('button', { name: `audit #${seq}` }).click();
  const modal = app.locator('dialog.entry-modal[open]');
  await expect(modal.getByRole('heading', { name: `Audit entry #${seq}` })).toBeVisible();
  await expect(modal).toContainText(OPERATOR);
  // The laptop checks one entry on its own; a backend without that route says so instead.
  await expect(modal).toContainText(isRemote ? /does not check single entries|is valid/ : `Signature by ${OPERATOR} is valid`);
});

test('a done step links to the audit entry that signed it', async ({ app }) => {
  test.fixme(isRemote, 'the cloud backend does not send audit_seq on steps yet');
  await ask(app, COVERED.text);
  const ack = await acknowledge(app, '01');
  const seq = (ack.audit as { seq: number }).seq;
  await app.getByRole('button', { name: `Step 01 acknowledged, open audit entry ${seq}` }).click();
  await expect(app.locator('dialog.entry-modal[open]').getByRole('heading', { name: `Audit entry #${seq}` })).toBeVisible();
});

test('the printed checklist holds every step in order with the sheet id', async ({ app }) => {
  const body = await ask(app, COVERED.text);
  await app.emulateMedia({ media: 'print' });
  const sheet = app.locator('.print-sheet');
  await expect(sheet).toBeVisible();
  await expect(app.locator('main.page')).toBeHidden();
  await expect(sheet.locator('tbody.ps-step')).toHaveCount(COVERED.steps);
  await expect(sheet.locator('.ps-no').filter({ hasText: /^\d\d$/ }).first()).toHaveText('01');
  await expect(sheet.locator('.ps-danger').first()).toBeVisible();
  await expect(sheet.locator('.ps-running')).toContainText(`Sheet ${body.query_id}`);
  await expect(sheet.locator('.ps-running')).toContainText(OPERATOR);
  await app.emulateMedia({ media: 'screen' });
});

test('paper results save in order and a skipped step is blocked', async ({ app, request }) => {
  await ask(app, COVERED.text);
  await app.getByRole('button', { name: 'Enter paper results' }).click();
  const form = app.locator('dialog.paper-modal[open]');
  for (const n of ['01', '02', '04']) await form.getByRole('checkbox', { name: new RegExp(`^${n} `) }).check();
  await form.locator('.paper-step').nth(1).getByLabel('Reading').fill('18 psig at LOCOP');
  await form.getByRole('button', { name: 'Sign and save 3 steps' }).click();

  await expect(form).toContainText('2 of 3 steps saved');
  await expect(form.locator('.check-bad')).toContainText('Step 04 not saved');
  const { entries } = await (await request.get('/api/audit?limit=5')).json();
  expect(entries.filter((e: { summary: string }) => / from paper: allowed$/.test(e.summary))).toHaveLength(2);
  await form.getByRole('button', { name: 'Done' }).click();
  await expect(app.locator('.step-list > li').nth(1)).toHaveClass(/step-done/);
});

test('the theme toggle switches between light and dark', async ({ app }) => {
  const dark = await app.evaluate(() => document.documentElement.classList.contains('dark'));
  await app.getByRole('button', { name: dark ? 'Switch to light theme' : 'Switch to dark theme' }).click();
  await expect(app.locator('html')).toHaveClass(dark ? /^(?!.*\bdark\b)/ : /\bdark\b/);
});

test('the showcase page loads', async ({ app }) => {
  const res = await app.goto('/showcase/');
  expect(res?.status()).toBe(200);
  await expect(app.locator('h1').first()).toBeVisible();
});

test('a phone-width screen has no sideways scroll', async ({ app }) => {
  await app.setViewportSize({ width: 375, height: 812 });
  await ask(app, COVERED.text);
  const [scroll, width] = await app.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(scroll).toBeLessThanOrEqual(width);
});

test('the laptop demo makes no request off this machine', async ({ app, problems }) => {
  test.skip(isRemote, 'the cloud preview is online by design');
  await ask(app, COVERED.text);
  await acknowledge(app, '01');
  await app.getByRole('button', { name: 'Verify log' }).first().click();
  await expect(app.locator('.trust-strip .verify-ok')).toBeVisible();
  expect(problems.offsite).toEqual([]);
});
