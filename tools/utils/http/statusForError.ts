import type { ErrorStatusRule } from './ErrorStatusRule';

/** Ordered rules; first match wins. `undefined` means none matched — the
 *  caller supplies its own default (typically 500). */
export function statusForError(
  err: unknown,
  rules: readonly ErrorStatusRule[],
): number | undefined {
  for (const rule of rules) {
    if (rule.test(err)) return rule.status;
  }
  return undefined;
}
