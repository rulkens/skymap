/**
 * flowSlice — the workbench's flow settings default + its reducers.
 *
 * The slice IS the canonical `FlowSettings` (the flat type the runtime flow
 * renderer reads every frame), not a workbench-local struct. Phase E rewires
 * the workbench to drive the one real renderer, so the store must hold exactly
 * what `encodeCompute`/`draw` take — no translation.
 *
 * Why flat, and what the old per-mode shape dropped:
 *   - The spike kept an `advect` and a `streamline` object, each carrying
 *     `count/flowSpeed/densityBias/wander/trail/size/exposure/contrast`.
 *     Switching mode just showed the other field. The canonical renderer shares
 *     ONE buffer set across both modes and reseeds on switch, so there is only
 *     ever one live param set — a single flat object, with `mode` as a field.
 *   - `size` is gone: the renderer pins ribbon half-width to the `RIBBON_WIDTH`
 *     constant (the spike's advect default), so it's no longer a tunable.
 *   - `exposure`/`contrast` are gone: those were the spike's per-mode tonemap
 *     knobs. The canonical renderer has no tonemap — the workbench's HDR blit
 *     uses fixed exposure/contrast and `intensity` is the brightness control.
 *
 * The default is `DEFAULT_FLOW` with `enabled` forced true: the workbench is a
 * flow-tuning harness, so it should show ribbons the instant it boots rather
 * than the runtime's default-off (the runtime defers the cube fetch until the
 * user opts in; the workbench always wants the field up).
 *
 * Reducers are copy-on-write: each returns a fresh object so the store's
 * reference-equality gate sees a real change. `setFlowParam` is keyed by
 * `NumericFlowKey` — the numeric knobs only, excluding `enabled` (boolean) and
 * `mode` (a union with its own setter) — so the slider wiring can't accidentally
 * write a number into a non-numeric field.
 */
import type { FlowSettings } from '../../../../../src/@types/settings/FlowSettings';
import type { FlowMode } from '../../../../../src/@types/data/FlowMode';
import { DEFAULT_FLOW } from '../../../../../src/data/defaults';

export const defaultFlowSlice: FlowSettings = { ...DEFAULT_FLOW, enabled: true };

/** The numeric (slider-driven) keys of FlowSettings — excludes `enabled`/`mode`. */
export type NumericFlowKey =
  | 'intensity'
  | 'count'
  | 'trail'
  | 'flowSpeed'
  | 'densityBias'
  | 'wander'
  | 'boundaryFadeWidth';

export function setFlowEnabled(prev: FlowSettings, enabled: boolean): FlowSettings {
  return { ...prev, enabled };
}

export function setFlowMode(prev: FlowSettings, mode: FlowMode): FlowSettings {
  return { ...prev, mode };
}

export function setFlowParam(
  prev: FlowSettings,
  key: NumericFlowKey,
  value: number,
): FlowSettings {
  return { ...prev, [key]: value };
}
