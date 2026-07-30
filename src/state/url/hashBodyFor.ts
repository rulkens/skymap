/**
 * hashBodyFor — derive the whole `window.location.hash` BODY (no leading `#`)
 * from a `RootState` snapshot. This is the URL-WRITE half of the hash sync: the
 * saga reads the fresh store state on a trigger, calls this, and hands the
 * result to `writeHashBody`, which owns the compare-and-skip and the actual
 * `pushState`.
 *
 * Walks `HASH_PARAM_SOURCES` — see that module's docblock for the full
 * `writesOn` / row-ownership contract — calling each row's `write(state)` and
 * dropping the `null` results, so a row with nothing to say (home focus, live
 * clock, default orientation) contributes no bytes and the common case stays a
 * bare URL. The survivors go to `composeHashParams` for the actual
 * `key=value&key=value` joining; this function owns only the walk-and-filter,
 * not the string policy (raw passthrough, `&`-joining), which stays the single
 * fact `composeHashParams` states.
 *
 * ### Why table order, not "whatever order changed most recently"
 *
 * `composeHashParams` preserves Map insertion order, and this function
 * populates that Map by walking `HASH_PARAM_SOURCES` top to bottom — so the
 * table's declared order (APPEND-ONLY, per its own docblock) fully determines
 * the on-URL layout, independent of which row's underlying state last changed.
 * That determinism is the whole point: two states with the same focus, clock,
 * and orientation must compose to byte-identical hashes, or an old shared link
 * — bookmarked with `focus=…&t=…` in that order — would read as "different"
 * from a freshly composed one and either fail a stale-link comparison or
 * trigger a spurious history rewrite the moment anything else changes.
 */

import { HASH_PARAM_SOURCES } from './hashParamSources';
import { composeHashParams } from '../../utils/url/composeHashParams';

import type { RootState } from '../../store/types';

export function hashBodyFor(state: RootState): string {
  const params = new Map<string, string>();
  for (const source of HASH_PARAM_SOURCES) {
    const value = source.write(state);
    if (value !== null) params.set(source.key, value);
  }
  return composeHashParams(params);
}
