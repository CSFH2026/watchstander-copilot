import { test as base, expect, type Page, type Response } from '@playwright/test';

export const isRemote = !!process.env.E2E_BASE_URL;

// EOOW-02, so a run against a shared backend never resets the drill of whoever demos as EOOW-01.
export const OPERATOR = 'EOOW-02';

// Fixed questions with fixed answers in the ddg dataset, on the laptop and on the cloud alike.
export const COVERED = { text: 'low lube oil pressure on number two SSGTG', procedure: 'EOCC-SSGTG-LLOP', steps: 10 };
export const OFF_TOPIC = 'how do I bake bread';
// Two procedures fit within the ambiguity margin; the screen asks the watch to confirm.
export const AMBIGUOUS = { text: 'MRG LO pressure dropping on shaft 2' };

type Problems = { errors: string[]; offsite: string[] };

/**
 * Every test starts the same way: this operator's drill reset, the page open, the operator picked,
 * and the backend answering. Uncaught page errors and console errors fail the test at the end.
 */
export const test = base.extend<{ app: Page; problems: Problems }>({
  problems: async ({}, use) => {
    await use({ errors: [], offsite: [] });
  },
  app: async ({ page, request, baseURL, problems }, use) => {
    const origin = new URL(baseURL!).host;
    page.on('pageerror', (err) => problems.errors.push(`pageerror: ${err.message}`));
    page.on('console', (msg) => {
      // A 404 on /api/audit/<seq> is expected on a backend without the entry route: the modal falls back.
      if (msg.type() === 'error' && !/Failed to load resource.*404/.test(msg.text())) problems.errors.push(`console: ${msg.text()}`);
    });
    page.on('request', (req) => {
      const host = new URL(req.url()).host;
      if (host && host !== origin && !req.url().startsWith('data:')) problems.offsite.push(req.url());
    });

    const reset = await request.post('/api/reset', { data: { operator_id: OPERATOR } });
    expect(reset.ok(), 'reset the drill').toBeTruthy();
    await page.goto('/');
    await expect(page.locator('.header .badge')).not.toHaveText('Checking');
    await page.getByLabel('Operator').selectOption(OPERATOR);
    await use(page);
    expect(problems.errors, 'no page or console errors').toEqual([]);
  },
});

export { expect };

/** Types a question, presses Ask, and returns the API's answer once the screen has it. */
export async function ask(page: Page, text: string): Promise<Record<string, unknown>> {
  await page.getByPlaceholder(/^Describe the problem/).fill(text);
  const answer = page.waitForResponse((r: Response) => r.url().endsWith('/api/query') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  const body = (await (await answer).json()) as Record<string, unknown>;
  await expect(page.locator('.result, .empty').first()).toBeVisible();
  return body;
}

/** Waits for the answer to one acknowledge click. */
export async function acknowledge(page: Page, seq: string): Promise<Record<string, unknown>> {
  const answer = page.waitForResponse((r: Response) => r.url().endsWith('/api/action'));
  await page.getByRole('button', { name: `Acknowledge step ${seq}` }).click();
  return (await (await answer).json()) as Record<string, unknown>;
}
