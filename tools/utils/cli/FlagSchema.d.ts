/**
 * Declared boolean-flag schema for `parseFlags` — a record mapping each
 * flag name the tool script cares about to the literal `'bool'`.
 *
 * An explicit schema (rather than auto-detecting flags from argv) turns
 * typos into "missing key" lookups at the call site, which surface in the
 * type checker, instead of silently parsing a misspelled flag as a new
 * one.
 */
export type FlagSchema = Record<string, 'bool'>;
