/**
 * skyCubemapFaceContext — unit tests for the black-hole sky cubemap's
 * per-face capture camera.
 *
 * Mirrors `pickFrameContext.test.ts`'s fixture shape (same bootstrap-gate
 * handles, same `settings`/`subsystems` shape `deriveSourceMasks` reads) —
 * see that file's header for why each field is there.
 */

import { describe, it, expect } from 'vitest';

import { skyCubemapFaceContext } from '../../../../src/services/engine/frame/skyCubemapFaceContext';
import { deriveSourceMasks } from '../../../../src/services/engine/frame/deriveSourceMasks';
import { GALAXY_CATALOG_SOURCES } from '../../../../src/data/sources';
import { galaxyCatalogIdOf } from '../../../../src/utils/galaxyCatalogIdOf';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { EngineState } from '../../../../src/@types/engine/state/EngineState';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { CameraPose } from '../../../../src/@types/camera/CameraPose';
import type { CameraProjection } from '../../../../src/@types/camera/CameraProjection';
import type { CubeFace } from '../../../../src/@types/rendering/CubeFace';
import type { Vec3 } from '../../../../src/@types/math/Vec3';
import type { FadeId } from '../../../../src/@types/animation/FadeId';

const LAST_POSE: CameraPose = { target: [1, 2, 3], yaw: 0.5, pitch: 0.1, distance: 50 };
const PROJECTION: CameraProjection = { fovYRad: 1.2, aspect: 16 / 9, near: 0.1, far: 10000 };
const LAST_SIM_DAYS = 2460000.0;
const EYE_MPC: Readonly<Vec3> = [12, -34, 56];

// Index order matches `CubeFace`'s doc comment: ±X, ±Y, ±Z.
const EXPECTED_AXIS: readonly Vec3[] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/**
 * Build an `EngineState`-shaped fixture with every bootstrap-gate handle
 * populated (so `isEngineReady` passes by default) and a `cameraRuntime`
 * carrying the live projection + last-frame epoch that
 * `skyCubemapFaceContext` reads for near/far and `simDays`.
 */
function makeState(
  overrides: {
    cam?: OrbitCamera | null;
    galaxyPointRenderer?: unknown;
    renderTargets?: unknown;
    galaxyPickRenderer?: unknown;
    compositor?: unknown;
    texturedDisks?: unknown;
  } = {},
): EngineState {
  const cam =
    overrides.cam === undefined
      ? ({
          target: [0, 0, 0],
          yaw: 0,
          pitch: 0,
          distance: 100,
          position: new Float32Array(3),
        } as unknown as OrbitCamera)
      : overrides.cam;
  const galaxyPointRenderer =
    overrides.galaxyPointRenderer === undefined ? ({} as unknown) : overrides.galaxyPointRenderer;
  const renderTargets =
    overrides.renderTargets === undefined ? ({} as unknown) : overrides.renderTargets;
  const galaxyPickRenderer =
    overrides.galaxyPickRenderer === undefined ? ({} as unknown) : overrides.galaxyPickRenderer;
  const compositor = overrides.compositor === undefined ? ({} as unknown) : overrides.compositor;
  const texturedDisks =
    overrides.texturedDisks === undefined ? ({} as unknown) : overrides.texturedDisks;

  const items = Object.fromEntries(
    GALAXY_CATALOG_SOURCES.map((s) => [
      galaxyCatalogIdOf(s),
      { enabled: true, labelEnabled: true },
    ]),
  );

  return {
    cam,
    gpu: { galaxyPointRenderer, renderTargets, galaxyPickRenderer, compositor },
    subsystems: {
      texturedDisks,
      fades: { opacityOf: (id: FadeId) => (id.kind === 'galaxyCatalog' ? 0 : 0) },
    },
    settings: {
      galaxyCatalogs: { items },
      orientation: 'equatorial',
      starCatalogs: { enabled: false, items: { famousStar: { enabled: false } } },
      bodies: { items: { sun: { enabled: false }, 's-star': { enabled: false } } },
    },
    selectionRows: { hover: null, select: null, focus: null },
    data: { bodies: { earth: null, planets: [], stars: [] } },
    cameraRuntime: {
      lastPose: { current: LAST_POSE },
      projection: PROJECTION,
      lastRenderedSimDays: { current: LAST_SIM_DAYS },
    },
  } as unknown as EngineState;
}

describe('skyCubemapFaceContext', () => {
  it('derives a ReadyFrameContext with the eye at the anchor position, looking along the requested face axis', () => {
    const state = makeState();
    for (let face = 0; face < 6; face++) {
      const ctx = skyCubemapFaceContext({
        state,
        eyeMpc: EYE_MPC,
        face: face as CubeFace,
        faceSizePx: 256,
      });
      expect(ctx).not.toBeNull();
      if (ctx === null) continue;

      expect(ctx.drawCamPos).toEqual(EYE_MPC);
      // viewSlot = face + 1 (Task 13b) — slot 0 is reserved for the main
      // view, so a roster renderer's view-slot buffer never confuses this
      // face's write with the real frame's.
      expect(ctx.viewSlot).toBe(face + 1);

      // Independent geometric check: the forward direction (target − eye,
      // read off the assembled camera, not re-derived from yaw/pitch) must
      // point exactly along this face's expected axis.
      const cam = ctx.cam;
      const fx = cam.target[0] - cam.position[0];
      const fy = cam.target[1] - cam.position[1];
      const fz = cam.target[2] - cam.position[2];
      const len = Math.hypot(fx, fy, fz);
      const forward: Vec3 = [fx / len, fy / len, fz / len];
      const expectedAxis = EXPECTED_AXIS[face]!;
      const dot =
        forward[0] * expectedAxis[0] + forward[1] * expectedAxis[1] + forward[2] * expectedAxis[2];
      expect(dot).toBeCloseTo(1, 10);
    }
  });

  it('returns null before bootstrap', () => {
    expect(
      skyCubemapFaceContext({
        state: makeState({ cam: null }),
        eyeMpc: EYE_MPC,
        face: 0,
        faceSizePx: 256,
      }),
    ).toBeNull();
    expect(
      skyCubemapFaceContext({
        state: makeState({ galaxyPointRenderer: null }),
        eyeMpc: EYE_MPC,
        face: 0,
        faceSizePx: 256,
      }),
    ).toBeNull();
    expect(
      skyCubemapFaceContext({
        state: makeState({ galaxyPickRenderer: null }),
        eyeMpc: EYE_MPC,
        face: 0,
        faceSizePx: 256,
      }),
    ).toBeNull();
  });

  it('carries the draw mask, not the pick mask, as visibleSourceMask', () => {
    const state = makeState();
    const ctx = skyCubemapFaceContext({ state, eyeMpc: EYE_MPC, face: 0, faceSizePx: 256 });
    expect(ctx).not.toBeNull();
    if (ctx === null) return;
    expect(ctx.visibleSourceMask).toBe(deriveSourceMasks(state).draw);
  });

  it('renders a world direction to the exact (s,t) the WGSL cube sampler computes for it', () => {
    // Capture↔sample identity (audit-cubemap-alignment.md): a star at world
    // direction d must land, under the face camera's vp + WebGPU's top-left
    // viewport transform, on the SAME (u,v) the GL/Vulkan/WGSL cube-face
    // table derives from d. Independently implements both sides; fails as
    // v = 1 − t if the capture's clip-Y mirror is ever dropped. One
    // direction per face, all with t well away from the flip-invariant 0.5.
    const state = makeState();
    const directions: readonly Vec3[] = [
      [0.9, 0.1, 0.3], // +X
      [-0.9, 0.2, 0.15], // −X
      [0.1, 0.8, 0.2], // +Y
      [0.2, -0.85, 0.3], // −Y
      [0.15, 0.2, 0.9], // +Z
      [0.3, 0.2, -0.93], // −Z
    ];

    for (const d of directions) {
      // Cube-face selection + (s,t) per the GL table 8.19 / WGSL rules.
      const [x, y, z] = d;
      const ax = Math.abs(x);
      const ay = Math.abs(y);
      const az = Math.abs(z);
      let face: number;
      let sc: number;
      let tc: number;
      let ma: number;
      if (ax >= ay && ax >= az) {
        face = x > 0 ? 0 : 1;
        ma = ax;
        sc = x > 0 ? -z : z;
        tc = -y;
      } else if (ay >= az) {
        face = y > 0 ? 2 : 3;
        ma = ay;
        sc = x;
        tc = y > 0 ? z : -z;
      } else {
        face = z > 0 ? 4 : 5;
        ma = az;
        sc = z > 0 ? x : -x;
        tc = -y;
      }
      const s = (sc / ma + 1) / 2;
      const t = (tc / ma + 1) / 2;

      const ctx = skyCubemapFaceContext({
        state,
        eyeMpc: EYE_MPC,
        face: face as CubeFace,
        faceSizePx: 256,
      });
      expect(ctx).not.toBeNull();
      if (ctx === null) continue;

      // World point 1 Mpc out along d, through the face's cosmo vp
      // (column-major, clip = vp · [p, 1]).
      const p: Vec3 = [EYE_MPC[0] + d[0], EYE_MPC[1] + d[1], EYE_MPC[2] + d[2]];
      const vp = ctx.vp;
      const cx = vp[0]! * p[0] + vp[4]! * p[1] + vp[8]! * p[2] + vp[12]!;
      const cy = vp[1]! * p[0] + vp[5]! * p[1] + vp[9]! * p[2] + vp[13]!;
      const cw = vp[3]! * p[0] + vp[7]! * p[1] + vp[11]! * p[2] + vp[15]!;
      // WebGPU viewport transform: top-left origin, y down.
      const u = (cx / cw + 1) / 2;
      const v = (1 - cy / cw) / 2;

      expect(u).toBeCloseTo(s, 5);
      expect(v).toBeCloseTo(t, 5);
    }
  });

  it("clips well below the S-star scale, not the live cosmo camera's 10-kpc near plane", () => {
    // The capture's actual content (S-stars, the field around Sgr A*) sits
    // at hundreds of AU — reusing the live projection's near (0.01 Mpc /
    // 10 kpc, PROJECTION above) would clip it all invisible. This is the
    // regression the fix addresses; see skyCubemapFaceContext's
    // SKY_CAPTURE_NEAR_MPC docblock.
    const state = makeState();
    const ctx = skyCubemapFaceContext({ state, eyeMpc: EYE_MPC, face: 0, faceSizePx: 256 });
    expect(ctx).not.toBeNull();
    if (ctx === null) return;
    expect(ctx.cam.near).toBeLessThan(100 * SCALE_UNITS.AU_TO_MPC);
  });
});
