/**
 * EngineFlowFieldsHandle — CF4++ peculiar-velocity flow overlay controls.
 *
 * Default-off opt-in: `setEnabled(true)` lazy-loads the velocity cube through
 * the demand model (the cube is paid only on first enable, never at boot) and
 * fades the layer in. The fade-in is split by lifecycle: the slot commit owns
 * the FIRST-enable fade-in (it fires `fadeTo(1)` the moment the cube actually
 * lands, so the ramp syncs to when ribbons can first draw), while this handle
 * owns the re-enable branch (cube already resident → fade in immediately) and
 * the fade-out branch (disable; the cube stays resident — demand never unloads).
 *
 * `setMode` / `setCount` reseed the shared particle buffers (both modes share
 * one buffer set; switching mode or changing count seeds afresh). Every numeric
 * setter clamps at the write site so a runaway slider or devtools call can't
 * blow out a GPU buffer or zero-multiply the layer to black.
 */
import type { FlowMode } from '../../data/FlowMode';

export type EngineFlowFieldsHandle = {
  setEnabled: (enabled: boolean) => void;
  setMode: (mode: FlowMode) => void;
  setIntensity: (value: number) => void; // [0, 1]
  setCount: (value: number) => void; // [0, MAX_PARTICLES]
  setTrail: (value: number) => void;
  setFlowSpeed: (value: number) => void;
  setDensityBias: (value: number) => void; // [0, 1]
  setWander: (value: number) => void;
};
