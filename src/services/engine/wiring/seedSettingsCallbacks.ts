/**
 * seedSettingsCallbacks — fan-out helper that fires every optional
 * settings-echo callback once with the engine's startup defaults.
 *
 * ### Why this exists
 *
 * The engine maintains the *truth* for every setting React mirrors
 * (point size, brightness, auto-rotate, tone-map curve, exposure,
 * source visibility mask, …).  React's components initialise their
 * own state from hard-coded defaults, but the engine is allowed to
 * clamp/override those values on startup.  To prevent silent drift,
 * the engine fires each `onXChange` callback *once* at init with its
 * actual default.
 *
 * Centralising the fan-out in one helper (instead of hand-rolled
 * `cb.onXChange?.(value)` lines in the startup IIFE):
 *
 *   - Lets every callback fire from a single audited code path, so
 *     adding a new setting is a one-line edit to `Snapshot` + the
 *     fan-out body (and its test) instead of a fourth place to grep.
 *   - Keeps the engine's startup IIFE focused on imperative wiring
 *     rather than echo bookkeeping.
 *   - Makes it trivially unit-testable: pass a stub `cb` with vi.fn()
 *     spies and assert each gets called exactly once with the right
 *     value.  No GPU device, no async cloud load.
 *
 * The helper does *not* fire required callbacks (`onStatusChange`,
 * `onHoverChange`, `onSelectChange`) — those have stricter lifecycle
 * rules and the engine handles them inline.
 */

import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';
import type { SettingsCallbackSeed } from '../../../@types/engine/wiring/SettingsCallbackSeed';

/**
 * Fire every optional settings callback in `cb` exactly once with the
 * matching value from `snapshot`.  Callbacks left undefined on `cb` are
 * silently skipped — the optional-chaining keeps each fan-out a no-op
 * when the React layer doesn't need that particular echo.
 *
 * Order is cosmetic — subscribers must not depend on it.
 */
export function seedSettingsCallbacks(_cb: EngineCallbacks, _snapshot: SettingsCallbackSeed): void {
  // Every settings cluster now lives in the engine-owned store, seeded from the
  // same `data/defaults.ts` values React reads through `useSettingsStore`
  // selectors — so there is no echo left to fire at startup. The structures /
  // labels cluster was the last holdout; its per-category marker + label
  // visibility records are now projected on read (`selectStructureItems` /
  // `selectSurveyItems` + the `useMemo` projections), not seeded through a
  // `cb.labels` echo. The helper + its `SettingsCallbackSeed` argument are kept
  // as an inert husk for one migration step; Phase 3 deletes them together.
}
