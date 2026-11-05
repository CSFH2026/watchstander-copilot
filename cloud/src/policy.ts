// Twin of api/policy/engine.py: the same rules and the same reason strings. State is the set of
// acknowledged steps, rebuilt from the operator's audit rows on every request, as replay() does.
import { procedure, procedureOf } from './store.ts';
import type { Env, Procedure, Step } from './types.ts';

const short = (stepId: string) => stepId.slice(stepId.lastIndexOf('-') + 1);

export async function doneSteps(env: Env, operator: string): Promise<Set<string>> {
  const rows = await env.DB.prepare("SELECT event, payload FROM audit WHERE actor = ? AND event IN ('action', 'reset') ORDER BY seq")
    .bind(operator)
    .all<{ event: string; payload: string }>();
  const done = new Set<string>();
  for (const r of rows.results) {
    if (r.event === 'reset') done.clear();
    else {
      const p = JSON.parse(r.payload) as { allowed?: boolean; step_id?: string };
      if (p.allowed && p.step_id) done.add(p.step_id);
    }
  }
  return done;
}

export function states(done: Set<string>, proc: Procedure | null): Step[] {
  return (proc?.steps ?? []).map((s) => ({
    step_id: s.step_id,
    seq: s.seq,
    text: s.text,
    requires: s.requires,
    danger: s.danger,
    state: done.has(s.step_id) ? 'done' : s.requires.every((r) => done.has(r)) ? 'next' : 'locked',
  }));
}

export async function check(env: Env, done: Set<string>, procedureId: string, stepId: string): Promise<[boolean, string]> {
  const owner = await procedure(env, procedureOf(stepId));
  const step = owner?.steps.find((s) => s.step_id === stepId);
  if (!owner || !step) return [false, `Blocked: ${stepId} is not a step in any authorized procedure.`];
  if (owner.procedure_id !== procedureId)
    return [false, `Blocked: step ${short(stepId)} belongs to ${owner.procedure_id}, not the active procedure ${procedureId}.`];
  if (done.has(stepId)) return [false, `Blocked: step ${short(stepId)} is already acknowledged.`];
  const missing = step.requires.filter((r) => !done.has(r));
  if (missing.length) {
    let reason = `Blocked: step ${short(stepId)} requires step ${missing.map(short).join(', ')} first.`;
    if (step.danger) reason += ` Danger: ${step.danger}`;
    return [false, reason];
  }
  return [true, `Step ${short(stepId)} acknowledged.${step.danger ? ` Caution: ${step.danger}` : ''}`];
}
