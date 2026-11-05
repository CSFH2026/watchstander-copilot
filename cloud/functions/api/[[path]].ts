// Pages Functions entry: every /api/* request on the same origin as the static UI.
import { handle } from '../../src/app.ts';
import type { Env } from '../../src/types.ts';

// waitUntil lets a stale known-casualties cache refresh after the answer is sent.
export const onRequest: PagesFunction<Env> = ({ request, env, waitUntil }) => handle(request, env, waitUntil);
