// Twin of api/examples.py without the "often" chips: the audit log lives in D1 here and is not counted.
// Open CASREPs that name a procedure come first, then the dataset's fixed examples. A chip's text is the
// procedure's first symptom that this backend's own search finds as a clear match, cached per isolate.
import { bundle } from './bundle.ts';
import { snapshot } from './casreps.ts';
import { procedure } from './store.ts';
import { search } from './search.ts';
import type { Env } from './types.ts';

const MAX_CHIPS = 6;
const MAX_OPEN = 3;
const WINDOW_DAYS = 30;

type Chip = { text: string; procedure_id: string | null; reason: 'open' | 'example'; serial?: string };

const phrases = new Map<string, string | null>();
const fixedIds = new Map<string, string | null>();

async function phrase(env: Env, procedureId: string): Promise<string | null> {
  if (!phrases.has(procedureId)) {
    let found: string | null = null;
    for (const s of (await procedure(env, procedureId))?.symptoms ?? []) {
      const r = await search(env, s);
      if (r.confidence === 'clear' && r.candidates[0]?.procedure_id === procedureId) {
        found = s;
        break;
      }
    }
    phrases.set(procedureId, found);
  }
  return phrases.get(procedureId) ?? null;
}

async function fixedProcedure(env: Env, text: string): Promise<string | null> {
  if (!fixedIds.has(text)) fixedIds.set(text, (await search(env, text)).candidates[0]?.procedure_id ?? null);
  return fixedIds.get(text) ?? null;
}

export async function examples(env: Env, waitUntil?: (p: Promise<unknown>) => void) {
  const chips: Chip[] = [];
  const seen = new Set<string>();
  const casreps = env.CASREP_URL ? (await snapshot(env, waitUntil)).casreps : [];
  for (const c of casreps) {
    if (c.status !== 'open' || chips.length >= MAX_OPEN) continue;
    for (const id of c.procedure_ids.filter((p) => !seen.has(p))) {
      const text = await phrase(env, id);
      if (!text) continue;
      seen.add(id);
      chips.push({ text, procedure_id: id, reason: 'open', serial: c.serial });
      break;
    }
  }
  const fixed = await Promise.all(bundle.dataset.examples.map(async (text) => ({ text, id: await fixedProcedure(env, text) })));
  for (const { text, id } of fixed) {
    if (chips.length >= MAX_CHIPS) break;
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    chips.push({ text, procedure_id: id, reason: 'example' });
  }
  return { examples: chips, window_days: WINDOW_DAYS };
}
