/**
 * EngineFlowFieldsHandle — CF4++ peculiar-velocity flow overlay control.
 *
 * One entry point: `set(patch)` applies a partial update to the `settings.flow`
 * slice. The overlay's user-facing state is a single `FlowSettings` object (a
 * singleton-overlay-layer slice), so a patch-shaped setter mirrors the slice
 * instead of fanning into nine ad-hoc methods that each re-named one leaf. The
 * UI threads the same `Partial<FlowSettings>` through React's optimistic mirror
 * and this handle, so a knob change is one patch in both places.
 *
 * Per-leaf side effects live behind this handle, keyed off which keys the patch
 * carries:
 *   - `enabled` → demand re-eval (first enable lazy-loads the velocity cube)
 *     plus a fade. The fade is split by lifecycle: the slot commit owns the
 *     FIRST-enable fade-in (it fires the moment the cube lands, syncing the ramp
 *     to when ribbons can first draw); this handle owns re-enable (cube already
 *     resident → fade immediately) and fade-out (disable; the cube stays
 *     resident — demand never unloads).
 *   - `mode` / `count` → reseed the shared particle buffers (both modes share
 *     one buffer set; switching mode or changing count seeds afresh).
 * Numeric leaves clamp at the write site (the table-driven setters) so a runaway
 * slider or devtools call can't blow out a GPU buffer or zero-multiply to black.
 */
import type { FlowSettings } from '../../settings/FlowSettings';

export type EngineFlowFieldsHandle = {
  /** Apply a partial update to the flow overlay's `settings.flow` slice. */
  set: (patch: Partial<FlowSettings>) => void;
};
