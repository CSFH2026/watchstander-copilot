// Pages Functions entry: every /api/* request on the same origin as the static UI.
import { handle } from '../../src/app.ts';
import type { Env } from '../../src/types.ts';

export const onRequest: PagesFunction<Env> = ({ request, env }) => handle(request, env);
