/**
 * cubemapFaceContext — one face of a cubemap capture's camera, as a value.
 * Mirrors `pickFrameContext.ts`: roster layers read `ctx.fovYRad`/
 * `canvasSize`/`drawPxPerRad` as frame-globals, not just `viewProj`, so a
 * whole synthetic `ReadyFrameContext` is cheaper than threading a swapped
 * vp through every consumer. The row's `nearMpc` is also the pose distance and
 * the altitude NEAR0's bracket is sized from, so it sets the NEAR0 near plane.
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

/**
 * Forward axis per `CubeFace` (±X/±Y/±Z) and the `texture_cube` convention's
 * per-face up — the ±Y faces borrow world ±Z. The cube-view bind relies on both.
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
 * One basis per face, serving as both `poseBasis` and `upBasis` so the two cannot
 * drift. `updatePosition` decodes local +Z through the THIRD column, so that column
 * is `-forward`; `frameUp` reads the MIDDLE for screen-up, so it carries `FACE_UP`.
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

export function cubemapFaceContext(input: {
  readonly state: EngineState;
  readonly eyeMpc: Readonly<Vec3>;
  readonly face: CubeFace;
  readonly faceSizePx: number;
  /** Capture-camera near plane, Mpc — the row's `nearMpc`. */
  readonly nearMpc: number;
  /** This capture's first view slot; the face stamps `viewSlotBase + face`. */
  readonly viewSlotBase: number;
  /** The FRAME's clock, so a `nowMs`-animated roster layer ticks identically
   *  on a captured face and in the direct view. */
  readonly nowMs: number;
}): ReadyFrameContext | null {
  const { state, eyeMpc, face, faceSizePx, nearMpc, viewSlotBase, nowMs } = input;
  const forward = FACE_FORWARD[face]!;
  const basis = FACE_BASES[face]!;
  // A target `nearMpc` ahead at that same distance puts the derived eye back on
  // `eyeMpc` exactly, on every face. The distance is the row's near plane, not
  // 1 Mpc, because body passes gate on `ctx.cam.distance` against the
  // foreground reach: a capture at 1 Mpc would show a face no body at all.
  const target: Vec3 = [
    eyeMpc[0] + forward[0] * nearMpc,
    eyeMpc[1] + forward[1] * nearMpc,
    eyeMpc[2] + forward[2] * nearMpc,
  ];
  const pose: CameraPose = { target, yaw: 0, pitch: 0, distance: nearMpc };

  const ctx = deriveFrameContext(
    state,
    // Only `.width`/`.height` are read, and an offscreen capture has no canvas.
    { width: faceSizePx, height: faceSizePx } as unknown as HTMLCanvasElement,
    pose,
    // The capture pose is synthetic and world-absolute, so the pose-provider
    // seam routes every body through the Mpc path — no body arm can be engaged
    // on a face.
    { frame: 'absolute', pose },
    // 90° symmetric frustum, one cube face; `far` rides the live projection.
    {
      fovYRad: Math.PI / 2,
      aspect: 1,
      near: nearMpc,
      far: state.cameraRuntime.outputs.projection.far,
    },
    basis,
    basis,
    deriveSourceMasks(state).draw, // draw mask: a capture, not a click target

    nowMs,
    state.cameraRuntime.outputs.simDays,
    // The synthetic pose orbits no pivot: its altitude is its own distance.
    nearMpc,
  );
  if (!ctx.isReady) return null;
  // In place is safe: `deriveFrameContext` freshly allocated these arrays.
  flipClipY(ctx.vp);
  for (const slab of ctx.slabs) flipClipY(slab.vp);
  return { ...ctx, viewSlot: viewSlotBase + face };
}
