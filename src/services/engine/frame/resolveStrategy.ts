/**
 * resolveStrategy — pick the frame's `RenderStrategy` from the debug override
 * and the current timing state.
 *
 * ### Joint 1: one boolean fused two independent axes
 *
 * The frame used to derive its render strategy inline as
 * `timingService.enabled ? 'perLayerTimed' : 'merged'` — a single boolean
 * standing in for TWO axes that actually vary independently:
 *
 *   - whether GPU timing is on (are `timestampWrites` being collected at all), and
 *   - the pass SHAPE the executor encodes (one merged pass per target group, the
 *     tile-local production path, versus one pass per layer so each can carry its
 *     own `timestampWrites`).
 *
 * Fusing them made "timing enabled AND merged" — the harness's production-true
 * timed mode, where we want the exact production pass shape but still want the
 * numbers — unreachable: turning timing on forced the per-layer shape. Splitting
 * the choice into an explicit `settings.debug.renderStrategy` override restores
 * that cell. `'auto'` is the default and preserves the old derivation byte-for-byte
 * (so production and `?gpuTimings` stay identical to before this joint); any
 * explicit `RenderStrategy` value wins over the timing-derived one.
 *
 * Pure and total: no I/O, no state — just the two-axis classifier.
 */

import type { RenderStrategy } from '../../../@types/engine/frame/RenderStrategy';

export function resolveStrategy(
  override: RenderStrategy | 'auto',
  timingEnabled: boolean,
): RenderStrategy {
  if (override !== 'auto') return override;
  return timingEnabled ? 'perLayerTimed' : 'merged';
}
