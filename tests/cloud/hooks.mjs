// Loads cloud/data/bundle.json from WSC_CLOUD_BUNDLE, the bundle the test built, and lets JSON load without an
// import attribute, as wrangler's bundler allows.
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function load(url, context, next) {
  if (!url.endsWith('.json')) return next(url, context);
  const path = url.endsWith('/cloud/data/bundle.json') && process.env.WSC_CLOUD_BUNDLE ? pathToFileURL(process.env.WSC_CLOUD_BUNDLE) : new URL(url);
  return { format: 'module', source: `export default ${await readFile(path, 'utf8')};`, shortCircuit: true };
}
