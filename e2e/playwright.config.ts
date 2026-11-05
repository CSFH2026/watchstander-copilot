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
// The copilot reads known casualties from this stand-in board (e2e/fake_board.py), so no real board or key is needed.
const BOARD_PORT = PORT + 1;

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
    : [
        {
          command: `python3 fake_board.py ${BOARD_PORT}`,
          url: `http://127.0.0.1:${BOARD_PORT}/api/v1/health`,
          reuseExistingServer: false,
          timeout: 30_000,
        },
        {
          command: `../.venv/bin/uvicorn main:app --host 127.0.0.1 --port ${PORT}`,
          cwd: '../api',
          url: `http://127.0.0.1:${PORT}/api/health`,
          reuseExistingServer: false,
          timeout: 120_000,
          env: {
            HF_HUB_OFFLINE: '1',
            WSC_DATASET: 'ddg',
            WSC_AUDIT_PATH: join(mkdtempSync(join(tmpdir(), 'wsc-e2e-')), 'log.jsonl'),
            // The stand-in board; the cache keys its copy by board URL, so the laptop's own copy is untouched.
            CASREP_URL: `http://127.0.0.1:${BOARD_PORT}`,
            CASREP_READ_KEY: 'e2e-read-key',
          },
        },
      ],
});
