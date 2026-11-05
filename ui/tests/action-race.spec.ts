import { expect, test, type Page, type Route } from '@playwright/test';
import type { AuditEntry, QueryResult, Step } from '../lib/api';

const audit = { seq: 1, hash: 'test-hash', prev_hash: '', signature: 'test-signature', signer: 'EOOW-01' };
const procedure = { procedure_id: 'A', title: 'Procedure A', source: 'Test fixture', score: 1, symptoms: [] };
const steps: Step[] = [
  { step_id: 'A-01', seq: 1, text: 'First instruction', requires: [], danger: null, state: 'next' },
  { step_id: 'A-02', seq: 2, text: 'Second instruction', requires: ['A-01'], danger: null, state: 'locked' },
];
const result: QueryResult = {
  query_id: 'test-query', latency_ms: 1, procedure, steps,
  alternates: [{ procedure_id: 'B', title: 'Procedure B', score: 0.5 }],
  confidence: 'clear', notice: null, audit,
};

async function openProcedure(page: Page) {
  const calls = { queries: 0, actions: 0, resets: 0 };
  const entries: AuditEntry[] = [];
  let actionRoute: Route | undefined;
  let resetRoute: Route | undefined;
  let queryRoute: Route | undefined;
  let holdQuery = false;
  const headers = { 'Access-Control-Allow-Origin': '*' };

  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const fulfill = (json: unknown) => route.fulfill({ json, headers });
    if (path === '/api/health') {
      return fulfill({ ok: true, offline: true, procedures: 2, steps: 4, model: 'test', operator_ids: ['EOOW-01', 'EOOW-02'], dataset: { name: 'test', examples: ['Test symptom A'] } });
    }
    if (path === '/api/query') {
      calls.queries++;
      if (holdQuery) {
        queryRoute = route;
        return;
      }
      const isB = route.request().postDataJSON().text === 'Procedure B';
      return fulfill(isB ? {
        ...result, procedure: { ...procedure, procedure_id: 'B', title: 'Procedure B' },
        steps: steps.map((step) => ({ ...step, step_id: step.step_id.replace('A-', 'B-'), text: 'B ' + step.text })),
      } : result);
    }
    if (path === '/api/action') {
      calls.actions++;
      actionRoute = route;
      return;
    }
    if (path === '/api/reset') {
      calls.resets++;
      resetRoute = route;
      return;
    }
    if (path === '/api/audit') return fulfill({ entries });
    throw new Error('Unexpected API request: ' + path);
  });
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Operator' }).locator('option')).toHaveCount(2);
  await page.getByRole('button', { name: 'Test symptom A', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Procedure A', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Acknowledge step 01' })).toBeEnabled();

  return {
    calls,
    holdNextQuery() { holdQuery = true; },
    async failQuery() {
      await expect.poll(() => queryRoute !== undefined).toBe(true);
      holdQuery = false;
      return queryRoute!.abort('failed');
    },
    async finishAction(outcome: 'allowed' | 'blocked' | 'failure') {
      await expect.poll(() => actionRoute !== undefined).toBe(true);
      if (outcome === 'failure') return actionRoute!.abort('failed');
      const allowed = outcome === 'allowed';
      const stepId = actionRoute!.request().postDataJSON().step_id;
      entries.push({
        seq: 1, ts: '2026-01-01T12:00:00Z', actor: 'EOOW-01', event: 'action',
        summary: 'acknowledge ' + stepId + ': ' + outcome, hash: audit.hash, prev_hash: '', signer: audit.signer,
      });
      return actionRoute!.fulfill({
        headers, status: allowed ? 200 : 403,
        json: { allowed, reason: allowed ? null : 'Complete step 01 first.', step_id: stepId, audit,
          steps: allowed ? [{ ...steps[0], state: 'done', audit_seq: 1 }, { ...steps[1], state: 'next' }] : steps },
      });
    },
    async finishReset() {
      await expect.poll(() => resetRoute !== undefined).toBe(true);
      return resetRoute!.fulfill({ headers, json: { ok: true, audit } });
    },
  };
}

async function expectLocked(page: Page) {
  await expect(page.getByRole('button', { name: 'Print checklist', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Enter paper results', exact: true })).toBeDisabled();
  await expect(page.getByRole('textbox')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeDisabled();
  await expect(page.getByRole('combobox', { name: 'Operator' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Procedure B', exact: true })).toBeDisabled();
  for (const button of await page.locator('.chips button, .ack-btn').all()) {
    await expect(button).toBeDisabled();
  }
  await page.getByRole('button', { name: 'Open log', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Audit log' }).getByRole('button', { name: /Reset/ })).toBeDisabled();
  await page.getByRole('dialog', { name: 'Audit log' }).getByRole('button', { name: 'Close', exact: true }).click();
}

async function expectUnlocked(page: Page) {
  await expect(page.getByRole('textbox')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Ask', exact: true })).toBeEnabled();
  await expect(page.getByRole('combobox', { name: 'Operator' })).toBeEnabled();
  await page.getByRole('button', { name: 'Open log', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Audit log' }).getByRole('button', { name: 'Reset drill' })).toBeEnabled();
  await page.getByRole('dialog', { name: 'Audit log' }).getByRole('button', { name: 'Close', exact: true }).click();
}

async function expectAuditRow(page: Page, summary: string) {
  await page.getByRole('button', { name: 'Open log', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Audit log' });
  await expect(drawer.getByText(summary, { exact: true })).toBeVisible();
  await drawer.getByRole('button', { name: 'Close', exact: true }).click();
}

test('pending acknowledgment locks navigation, preserves steps, and refreshes audit on success', async ({ page }) => {
  const backend = await openProcedure(page);
  // Two clicks in one browser task exercise rapid duplicate input.
  await page.getByRole('button', { name: 'Acknowledge step 01' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expectLocked(page);
  await expect(page.getByRole('heading', { name: 'Procedure A', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Procedure steps' }).getByText('First instruction', { exact: true })).toBeVisible();
  await page.locator('form').evaluate((form) => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  await backend.finishAction('allowed');
  await expectAuditRow(page, 'acknowledge A-01: allowed');
  await expect(page.getByRole('button', { name: 'Step 01 acknowledged, open audit entry 1', exact: true })).toBeVisible();
  await expect(page.locator('.step').first()).toContainText('Acknowledged');
  await expect(page.getByRole('button', { name: 'Acknowledge step 02' })).toBeEnabled();
  await expectUnlocked(page);
  expect(backend.calls).toEqual({ queries: 1, actions: 1, resets: 0 });
  await page.getByRole('button', { name: 'Procedure B', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Procedure B', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Procedure steps' }).getByText('B First instruction', { exact: true })).toBeVisible();
  await expect(page.locator('.action-banner')).toHaveCount(0);
});

test('failed acknowledgment unlocks controls and permits a new procedure', async ({ page }) => {
  const backend = await openProcedure(page);
  await page.getByRole('button', { name: 'Acknowledge step 01' }).click();
  await expectLocked(page);
  await backend.finishAction('failure');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Backend not reachable');
  await expectUnlocked(page);
  await expect(page.locator('.step').first()).not.toContainText('Acknowledged');
  await page.getByRole('textbox').fill('Procedure B');
  await page.getByRole('textbox').press('Enter');
  await expect(page.getByRole('heading', { name: 'Procedure B', exact: true })).toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});

test('policy rejection preserves steps and appears in the audit log', async ({ page }) => {
  const backend = await openProcedure(page);
  await page.getByRole('button', { name: 'Acknowledge step 02' }).click();
  await backend.finishAction('blocked');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Complete step 01 first.');
  await expectAuditRow(page, 'acknowledge A-02: blocked');
  await expect(page.locator('.step').first()).not.toContainText('Acknowledged');
  await expect(page.locator('.step').nth(1)).toContainText('Locked');
  await expectUnlocked(page);
});

test('reset cannot overlap an acknowledgment or a new query', async ({ page }) => {
  const backend = await openProcedure(page);
  await page.getByRole('button', { name: 'Open log', exact: true }).click();
  await page.getByRole('button', { name: 'Reset drill' }).click();
  await page.getByRole('dialog', { name: 'Audit log' }).getByRole('button', { name: 'Close', exact: true }).click();
  await expectLocked(page);
  await backend.finishReset();
  await expect(page.getByRole('heading', { name: 'Procedure A', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox')).toBeEnabled();
  expect(backend.calls).toEqual({ queries: 1, actions: 0, resets: 1 });
});

test('a new search clears the old procedure and keeps it cleared on failure', async ({ page }) => {
  const backend = await openProcedure(page);
  backend.holdNextQuery();
  await page.getByRole('button', { name: 'Procedure B', exact: true }).click();
  await expect(page.getByText('Searching procedures', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Procedure A', exact: true })).toHaveCount(0);
  await expect(page.locator('.step')).toHaveCount(0);
  await expect(page.getByRole('textbox')).toBeDisabled();
  await page.getByRole('button', { name: 'Open log', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Reset drill' })).toBeDisabled();
  await page.getByRole('dialog', { name: 'Audit log' }).getByRole('button', { name: 'Close', exact: true }).click();
  await backend.failQuery();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Backend not reachable');
  await expect(page.getByRole('heading', { name: 'Procedure A', exact: true })).toHaveCount(0);
  await expect(page.locator('.step')).toHaveCount(0);
  await expectUnlocked(page);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Procedure B', exact: true })).toBeVisible();
  expect(backend.calls).toEqual({ queries: 3, actions: 0, resets: 0 });
});

for (const outcome of ['allowed', 'failure'] as const) {
  test(`closing paper entry during a pending ${outcome} response keeps navigation locked`, async ({ page }) => {
    const backend = await openProcedure(page);
    await page.getByRole('button', { name: 'Enter paper results', exact: true }).click();
    const paper = page.getByRole('dialog', { name: 'Enter paper results' });
    await paper.getByRole('checkbox').first().check();
    await paper.getByRole('button', { name: 'Sign and save 1 step', exact: true }).evaluate((button) => {
      (button as HTMLButtonElement).click();
      (button as HTMLButtonElement).click();
    });
    await expect.poll(() => backend.calls.actions).toBe(1);
    await paper.getByRole('button', { name: 'Close', exact: true }).click();
    await expectLocked(page);
    await backend.finishAction(outcome);
    await expectUnlocked(page);
    if (outcome === 'allowed') {
      await expect(page.locator('.step').first()).toContainText('Acknowledged');
      await expectAuditRow(page, 'acknowledge A-01: allowed');
    } else {
      await expect(page.getByRole('main').getByRole('alert')).toContainText('Backend not reachable');
      await expect(page.locator('.step').first()).not.toContainText('Acknowledged');
    }
    expect(backend.calls).toEqual({ queries: 1, actions: 1, resets: 0 });
    await page.getByRole('button', { name: 'Procedure B', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Procedure steps' }).getByText('B First instruction', { exact: true })).toBeVisible();
  });
}
