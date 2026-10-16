/**
 * fadeLayers — the fade-ownership manifest: every fadeable layer as one row, walked
 * once by `seedFades` at bootstrap. The ONE site that calls `fades.register`.
 *
 * Seeds are settings-derived, not a blanket 1.0 — a disabled layer seeded at 1
 * draws on frame 1 before its fade-out fires, and an enabled layer seeded at 0 is
 * invisible until `fadeTo(1)` finishes. Demand-loaded rows are the exception: with
 * no payload at construction they seed at 0 and fade IN on arrival, an asymmetry
 * carried per row as a `seed()` closure rather than one branch over a flag.
 */

import type { FadeLayer } from '../../../@types/animation/FadeLayer';
import type { EngineState } from '../../../@types/engine/state/EngineState';

// Every fade moved to a Layer's `visibility` entries; the manifest stays until the old bridges go.
export const FADE_LAYERS: readonly FadeLayer<unknown>[] = [];

// Called once at bootstrap from `wireSlots`. `register` is idempotent, so manifest
// order is diff-stability only — no row can clobber another.
export function seedFades(state: EngineState): void {
  const { settings } = state;
  const fades = state.subsystems.fades;
  for (const row of state.fadeRows) {
    for (const item of row.expand(state)) {
      fades.register(row.handle(item), row.seed(settings, item));
    }
  }
}
