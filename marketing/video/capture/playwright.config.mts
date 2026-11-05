import { defineConfig } from '@playwright/test';

// One browser, one run: the capture script drives a single server state in order.
export default defineConfig({ testDir: '.', workers: 1, retries: 0, reporter: 'list' });
