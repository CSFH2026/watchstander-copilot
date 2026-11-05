import { readFile } from 'node:fs/promises';

const STUB = new URL('./bundle.stub.json', import.meta.url);

export async function load(url, context, next) {
  if (!url.endsWith('.json')) return next(url, context);
  const source = await readFile(url.endsWith('/data/bundle.json') ? STUB : new URL(url), 'utf8');
  return { format: 'module', source: `export default ${source};`, shortCircuit: true };
}
