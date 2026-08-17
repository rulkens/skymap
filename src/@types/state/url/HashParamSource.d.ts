/**
 * HashParamSource — one entry in the `HASH_PARAM_SOURCES` table that owns a
 * single `key=value` slot of `window.location.hash`, in both directions.
 *
 * A row is the SOLE authority on its param: what it is called, whether its
 * presence means the visitor arrived with a specific intent, which dispatched
 * actions can change its serialized value, how to derive that value from the
 * store, and what a present or absent value means on the way back in. Adding a
 * hash param is therefore adding one row — no edit to the read saga, the write
 * saga, the composer, or the deep-link check.
 *
 * ── write ──
 * Takes the whole `RootState` and returns this param's value, or `null` to omit
 * the param entirely, so a row with nothing to say contributes no bytes and the
 * common case stays a bare URL. Taking `RootState` rather than a hand-assembled
 * projection is what keeps the row self-contained: the row names the selectors
 * it needs and nothing outside has to know which slices it reads.
 *
 * ── read / readAbsent ──
 * Two arms rather than one arm plus an `isInitial` flag. `read` handles a value
 * that is PRESENT on the URL; `readAbsent` says what this param's ABSENCE
 * should restore. The reading pass knows whether it is the boot read or a
 * back/forward navigation and skips `readAbsent` on the former (the store
 * already boots at its defaults, so re-asserting them would fight the engine's
 * own seed) — so that distinction is stated once, at the pass, instead of being
 * re-derived inside every row.
 *
 * Both arms RETURN actions instead of taking a `dispatch`. Returned actions
 * compose: a saga `put`s them, a test reads their payloads with no store at
 * all, and a row that needs two dispatches (`focus` pins the card AND flies the
 * camera) says so by returning two elements rather than by holding an
 * imperative handle.
 *
 * ── writesOn ──
 * The set of dispatched actions that can change this row's `write` output,
 * stated as a list of PREDICATES over an action — the row triggers if any of
 * them says yes. One shape, not two: an RTK action creator's `.match` already IS
 * `(action) => boolean`, so a row that wants three named actions lists three
 * `.match`es, and a row that wants a whole slice lists one prefix test. The
 * union this replaced (a list of matchers OR a bare predicate) bought nothing
 * over that and cost every consumer a `typeof` fork, which is also why a row
 * could not previously mix the two — the very thing `focus` needs.
 *
 * The completeness contract, and the reasoning behind each row's triggers, live
 * in the table's module docblock — that is the guard, so it belongs beside the
 * declarations it constrains.
 */

import type { Action } from '@reduxjs/toolkit';

import type { RootState } from '../../../store/types';

export type HashParamSource = {
  readonly key: string;

  /**
   * Does this param's presence mean "the visitor came here for something
   * specific"? Consumed by `hasDeepLink` to suppress the splash. `focus` and
   * `t` yes, `orientation` no — a pole preference is a view setting, not an
   * intent worth skipping the introduction for.
   */
  readonly deepLink: boolean;

  /** Which dispatched actions can change this row's `write` output. */
  readonly writesOn: readonly ((action: Action) => boolean)[];

  /** Serialize from the store. `null` omits the param entirely. */
  readonly write: (state: RootState) => string | null;

  /** Deserialize a PRESENT value into actions. Never called with an empty value. */
  readonly read: (value: string) => readonly Action[];

  /**
   * Restore this param's default when it is ABSENT from a hashchange. Never
   * called on the initial pass — the store already boots at defaults.
   */
  readonly readAbsent: () => readonly Action[];
};
