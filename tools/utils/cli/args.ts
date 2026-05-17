/**
 * parseFlags — minimal boolean-only argv parser for tool scripts.
 *
 * Scope intentionally tiny: each tool script declares the bool flags
 * it cares about and gets a record mapping flag name → boolean.  We
 * do not handle string-valued flags here because adding them would
 * grow the surface (separator handling, type schema, default values)
 * for a marginal benefit — the only string-valued flag in the codebase
 * (`--source-preference`) stays in its bespoke argv loop.
 *
 * Why a schema parameter rather than auto-detecting flags?  Auto-detect
 * would silently accept typos (`--frce` would parse as a new flag,
 * not a misspelling).  An explicit schema turns typos into "missing
 * key" lookups at the call site, which surfaces in the type checker
 * if the caller indexes through a typed record.
 */
export type FlagSchema = Record<string, 'bool'>;

export function parseFlags<S extends FlagSchema>(
  argv: readonly string[],
  schema: S,
): Record<keyof S, boolean> {
  const result = {} as Record<keyof S, boolean>;
  for (const key of Object.keys(schema) as (keyof S)[]) {
    result[key] = argv.includes(key as string);
  }
  return result;
}
