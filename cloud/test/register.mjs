// Lets `node --test` load the Pages Functions code: the generated bundle.json is swapped for a small stub
// (tests never depend on a corpus build), and JSON imports load without an import attribute, as wrangler allows.
import { register } from 'node:module';

register('./hooks.mjs', import.meta.url);
