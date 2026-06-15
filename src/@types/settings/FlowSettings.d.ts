/**
 * FlowSettings — the user-facing state of the CF4++ flow-field overlay layer.
 *
 * Flow is a singleton overlay layer (see
 * `docs/superpowers/conventions/singleton-overlay-layers.md`): all of its
 * user-facing state lives in `settings.flow`, exactly as `filaments` /
 * `milkyWay` do. This is the shape of that slice — the master `enabled` gate
 * plus the look/motion knobs the flow renderer reads every frame.
 *
 * Named (rather than inlined into `EngineSettingsState`) because three
 * consumers reference the same shape and would otherwise re-spell it: the
 * settings bag itself (`EngineSettingsState.flow`), the `DEFAULT_FLOW` seed in
 * `data/defaults.ts`, and the flow renderer's per-frame param argument
 * (`flowFieldRenderer.encodeCompute` / `draw` / `isAnimating`). One type, one
 * source of truth.
 *
 * The tunable defaults are the spike's hand-dialled advect look — see
 * `DEFAULT_FLOW`, which derives them from the SOURCE_REGISTRY flow row.
 */
import type { FlowFieldDefaults } from '../data/flow/FlowFieldDefaults';

/**
 * The live flow slice = the master `enabled` gate plus the eight look/motion
 * knobs. The knob shape + per-field docs live on `FlowFieldDefaults`, shared
 * with the SOURCE_REGISTRY flow row that seeds them.
 */
export type FlowSettings = {
  /** Master layer gate (default-off; the cube demand-loads on first enable). */
  enabled: boolean;
} & FlowFieldDefaults;
