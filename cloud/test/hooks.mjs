import { readFile } from 'node:fs/promises';

const STUB = new URL('./bundle.stub.json', import.meta.url);

// Resolved here, not only loaded, because cloud/data/ exists only after `make bundle`, and never in CI.
export async function resolve(specifier, context, next) {
  if (specifier.endsWith('/data/bundle.json')) return { url: STUB.href, shortCircuit: true };
  return next(specifier, context);
}

export async function load(url, context, next) {
  if (!url.endsWith('.json')) return next(url, context);
  return { format: 'module', source: `export default ${await readFile(new URL(url), 'utf8')};`, shortCircuit: true };
}
