/**
 * skyCubemapFaceContext — one face of the black-hole sky cubemap's capture
 * camera, as a value. Mirrors `pickFrameContext.ts` exactly: several roster
 * layers read `ctx.fovYRad`/`ctx.canvasSize`/`ctx.drawPxPerRad` as
 * frame-globals, not just `viewProj`, so this re-derives a full
 * `ReadyFrameContext` from a synthetic camera (eye = `eyeMpc`, forward = the
 * face's fixed axis, a 90° symmetric frustum) instead of threading a swapped
 * vp through every roster-layer consumer.
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
 * Forward axis per `CubeFace` (index order ±X/±Y/±Z, see `CubeFace.d.ts`).
 * `FACE_UP` is the WebGPU/D3D `texture_cube` convention's per-face up
 * reference: world ±Y is parallel to forward on the ±Y faces, so those two
 * borrow world ±Z instead. A later cube-view bind of this row's 6 layers
 * relies on both tables matching that convention exactly.
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
 * One basis per face, doing double duty as both `poseBasis` and `upBasis`.
 * With `yaw = pitch = 0` fixed below, `updatePosition` decodes local +Z
 * through `poseBasis` — so this basis' THIRD column is set to `-forward`
 * (target → eye), placing the derived eye exactly on `target - forward`.
 * `ORIENTATION_FRAMES`' own convention puts a basis' pole in the MIDDLE
 * column, which `frameUp` reads for screen-up — so the same matrix's middle
 * column carries `FACE_UP`, and one basis serves both roles with no risk of
 * the two drifting apart.
 */
const FACE_BASES: readonly Mat3[] = FACE_FORWARD.map((forward, i): Mat3 => {
  const up = FACE_UP[i]!;
  const back: Vec3 = [-forward[0], -forward[1], -forward[2]];
  return mat3FromColumns(cross3(up, back), up, back);
});

export function skyCubemapFaceContext(input: {
  readonly state: EngineState;
  readonly eyeMpc: Readonly<Vec3>;
  readonly face: CubeFace;
  readonly faceSizePx: number;
}): ReadyFrameContext | null {
  const { state, eyeMpc, face, faceSizePx } = input;
  const forward = FACE_FORWARD[face]!;
  const basis = FACE_BASES[face]!;
  // target = eyeMpc + forward, distance = 1: `updatePosition` then derives
  // position = target + 1·(-forward) = eyeMpc exactly, for every face.
  const target: Vec3 = [eyeMpc[0] + forward[0], eyeMpc[1] + forward[1], eyeMpc[2] + forward[2]];
  const pose: CameraPose = { target, yaw: 0, pitch: 0, distance: 1 };

  const ctx = deriveFrameContext(
    state,
    // deriveFrameContext only reads `.width`/`.height` off this — there is no
    // real canvas for an offscreen capture, so a size-shaped stub stands in.
    { width: faceSizePx, height: faceSizePx } as unknown as HTMLCanvasElement,
    pose,
    // 90° symmetric frustum sized for a cube face; near/far ride the live
    // engine projection so the capture clips at the same distances the main
    // camera does.
    {
      fovYRad: Math.PI / 2,
      aspect: 1,
      near: state.cameraRuntime.projection.near,
      far: state.cameraRuntime.projection.far,
    },
    basis,
    basis,
    // Draw mask, not pick: this is a real capture pass, not a click target.
    deriveSourceMasks(state).draw,
    performance.now(),
    state.cameraRuntime.lastRenderedSimDays.current,
  );
  return ctx.isReady ? ctx : null;
}
