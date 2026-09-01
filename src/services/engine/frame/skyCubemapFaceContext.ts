/**
 * skyCubemapFaceContext — one face of the black-hole sky cubemap's capture
 * camera, as a value. Mirrors `pickFrameContext.ts`: roster layers read
 * `ctx.fovYRad`/`canvasSize`/`drawPxPerRad` as frame-globals, not just
 * `viewProj`, so a whole synthetic `ReadyFrameContext` is cheaper than
 * threading a swapped vp through every consumer.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import type { CubeFace } from '../../../@types/rendering/CubeFace';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { Mat3 } from '../../../@types/math/Mat3';
import { deriveFrameContext } from './frameContext';
import { deriveSourceMasks } from './deriveSourceMasks';
import { mat3FromColumns } from '../../../utils/math/mat3FromColumns';
import { cross3 } from '../../../utils/math/cross3';
import { SCALE_UNITS } from '../../../data/scaleUnits';

// NOT the live cosmo near plane (0.01 Mpc): the capture's content sits at
// hundreds of AU, inside it, so reusing it clips every S-star away.
const SKY_CAPTURE_NEAR_MPC = 0.1 * SCALE_UNITS.AU_TO_MPC;

/**
 * Forward axis per `CubeFace` (±X/±Y/±Z), and the `texture_cube` convention's
 * per-face up (the ±Y faces borrow world ±Z, since world ±Y is forward
 * there). The cube-view bind relies on both matching that convention.
 */
const FACE_FORWARD: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const FACE_UP: readonly Vec3[] = [
  [0, -1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
  [0, -1, 0],
  [0, -1, 0],
];

/**
 * One basis per face, serving as both `poseBasis` and `upBasis` so the two
 * cannot drift. `updatePosition` decodes local +Z through the THIRD column,
 * so that column is `-forward`; `frameUp` reads the MIDDLE for screen-up, so
 * that one carries `FACE_UP`.
 */
const FACE_BASES: readonly Mat3[] = FACE_FORWARD.map((forward, i): Mat3 => {
  const up = FACE_UP[i]!;
  const back: Vec3 = [-forward[0], -forward[1], -forward[2]];
  return mat3FromColumns(cross3(up, back), up, back);
});

/**
 * Negate a vp's clip-Y row (column-major 1/5/9/13). `FACE_UP` is the GL
 * capture table, upright only under GL's bottom-left origin; WebGPU
 * rasterizes top-left, so every face would sample flipped (v = 1 − t) and no
 * rotation absorbs a reflection. The winding reversal is harmless here.
 */
function flipClipY(vp: Float32Array | Float64Array): void {
  vp[1] = -vp[1]!;
  vp[5] = -vp[5]!;
  vp[9] = -vp[9]!;
  vp[13] = -vp[13]!;
}

export function skyCubemapFaceContext(input: {
  readonly state: EngineState;
  readonly eyeMpc: Readonly<Vec3>;
  readonly face: CubeFace;
  readonly faceSizePx: number;
  /** The FRAME's clock, so a `nowMs`-animated roster layer ticks identically
   *  on a captured face and in the direct view. */
  readonly nowMs: number;
}): ReadyFrameContext | null {
  const { state, eyeMpc, face, faceSizePx, nowMs } = input;
  const forward = FACE_FORWARD[face]!;
  const basis = FACE_BASES[face]!;
  // A target one unit ahead at distance 1 puts the derived eye back on
  // `eyeMpc` exactly, on every face.
  const target: Vec3 = [eyeMpc[0] + forward[0], eyeMpc[1] + forward[1], eyeMpc[2] + forward[2]];
  const pose: CameraPose = { target, yaw: 0, pitch: 0, distance: 1 };

  const ctx = deriveFrameContext(
    state,
    // Only `.width`/`.height` are read, and an offscreen capture has no canvas.
    { width: faceSizePx, height: faceSizePx } as unknown as HTMLCanvasElement,
    pose,
    // 90° symmetric frustum, one cube face; `far` rides the live projection.
    {
      fovYRad: Math.PI / 2,
      aspect: 1,
      near: SKY_CAPTURE_NEAR_MPC,
      far: state.cameraRuntime.projection.far,
    },
    basis,
    basis,
    deriveSourceMasks(state).draw, // draw mask: a capture, not a click target

    nowMs,
    state.cameraRuntime.lastRenderedSimDays.current,
  );
  if (!ctx.isReady) return null;
  // In place is safe: `deriveFrameContext` freshly allocated these arrays.
  flipClipY(ctx.vp);
  for (const slab of ctx.slabs) flipClipY(slab.vp);
  // Slot 0 is the main view, so the view-slot rings keep this call's writes
  // off the real frame's (`ReadyFrameContext.viewSlot`).
  return { ...ctx, viewSlot: face + 1 };
}
