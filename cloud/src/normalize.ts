// Query-time twin of api/retrieval/normalize.py. The word lists come from the bundle, so this file
// holds only the two rules: expand shorthand in list order, then tokenize and drop stopwords.
import { bundle } from './bundle.ts';

const ABBREVIATIONS = bundle.normalize.abbreviations.map(
  ([short, long]) => [new RegExp(`\\b${escapeRe(short)}\\b`, 'gi'), `${short} (${long})`] as const,
);
const STOPWORDS = new Set(bundle.normalize.stopwords);
const TOKEN_RE = new RegExp(bundle.normalize.token_re, 'g');

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function expand(text: string): string {
  let out = text;
  // A function replacement, so a "$" in a long form is never read as a group reference.
  for (const [re, replacement] of ABBREVIATIONS) out = out.replace(re, () => replacement);
  return out;
}

export function tokens(text: string): string[] {
  return (expand(text).toLowerCase().match(TOKEN_RE) ?? []).filter((t) => !STOPWORDS.has(t));
}
