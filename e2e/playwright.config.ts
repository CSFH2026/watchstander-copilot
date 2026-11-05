import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

// E2E_BASE_URL points the same tests at a running backend, such as the Cloudflare preview.
// Without it, Playwright starts the laptop server on its own port with a throwaway audit log,
// so a run never touches the demo log and every run starts from the same empty state.
const remote = process.env.E2E_BASE_URL;
// E2E_PORT moves the laptop server when another copy of the app already uses this port.
const PORT = Number(process.env.E2E_PORT ?? 8099);

export default defineConfig({
  testDir: './tests',
  // One browser, one test at a time: the tests share one backend and its policy state.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'report' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: remote ?? `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: remote
    ? undefined
    : {
        command: `../.venv/bin/uvicorn main:app --host 127.0.0.1 --port ${PORT}`,
        cwd: '../api',
        url: `http://127.0.0.1:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          HF_HUB_OFFLINE: '1',
          WSC_DATASET: 'ddg',
          WSC_AUDIT_PATH: join(mkdtempSync(join(tmpdir(), 'wsc-e2e-')), 'log.jsonl'),
        },
      },
});
