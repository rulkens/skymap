/**
 * slabs — unit tests for `deriveSlabs`, `slabName`, `foregroundChainOrder`,
 * and `slabViewOf`.
 *
 * `deriveSlabs` instantiates the slab table (near-field bodies, the
 * cosmological scene, and one row per visible body) from the live camera and
 * the already-computed cosmological view-proj. `slabViewOf` is the
 * executor-side lookup that resolves a `slab: number` index (as named by a
 * `FrameStep`) into the `SlabView` a layer's `draw` actually consumes.
 */

import { describe, it, expect } from 'vitest';
import { mat4, vec3d } from 'wgpu-matrix';
import type { Mat4 } from 'wgpu-matrix';

import {
  deriveSlabs,
  slabViewOf,
  slabName,
  foregroundChainOrder,
  NEAR0,
  COSMO,
} from '../../../../src/services/engine/frame/slabs';
import { createOrbitCamera } from '../../../../src/utils/camera/createOrbitCamera';
import { computeForegroundViewProj } from '../../../../src/utils/camera/computeForegroundViewProj';
import { foregroundFrustum, MIN_NEAR_M } from '../../../../src/utils/camera/foregroundFrustum';
import { RENDER_ORIGIN_MPC } from '../../../../src/data/renderOrigin';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { OrbitCamera } from '../../../../src/@types/camera/OrbitCamera';
import type { ReadyFrameContext } from '../../../../src/@types/engine/frame/ReadyFrameContext';
import type { BodyPoseProvider } from '../../../../src/@types/engine/camera/BodyPoseProvider';
import type { BodyRelativePose } from '../../../../src/@types/engine/camera/BodyRelativePose';
import type { BodyState } from '../../../../src/@types/scene/BodyState';
import type { PlanetBody } from '../../../../src/@types/scene/PlanetBody';
import type { Vec2 } from '../../../../src/@types/math/Vec2';

function makeCam(distance: number): OrbitCamera {
  return createOrbitCamera({
    target: [0, 0, 0],
    yaw: 0.3,
    pitch: 0.1,
    distance,
    fovYRad: 1,
    aspect: 16 / 9,
    near: 0.1,
    far: 10000,
  });
}

/** A distinctive, non-identity Mat4 so byte-equality checks aren't vacuous. */
function makeCosmoVp(): Mat4 {
  return mat4.perspective(1, 16 / 9, 0.01, 50000);
}

const NO_POSE: BodyPoseProvider = () => null;

function makePlanet(overrides: Partial<PlanetBody> = {}): PlanetBody {
  return { id: 'test-planet', label: 'Test Planet', radiusM: 1e5, albedo: [1, 1, 1], ...overrides };
}

/** Every `deriveSlabs` input, defaulted to "no bodies" so each test overrides only what it exercises. */
function baseInput(
  overrides: Partial<Parameters<typeof deriveSlabs>[0]> = {},
): Parameters<typeof deriveSlabs>[0] {
  return {
    cam: makeCam(100),
    cosmoVp: makeCosmoVp(),
    pivotRadiusMpc: null,
    bodyStates: new Map<string, BodyState>(),
    pose: NO_POSE,
    visibleBodies: [],
    viewportPx: [1920, 1080] as Vec2,
    starSphereRangeM: null,
    ...overrides,
  };
}

describe('deriveSlabs', () => {
  it('returns two rows with index === array position when no body is visible', () => {
    const slabs = deriveSlabs(baseInput({ cam: makeCam(100) }));
    expect(slabs).toHaveLength(2);
    expect(slabs[0]?.index).toBe(NEAR0);
    expect(slabs[1]?.index).toBe(COSMO);
  });

  it.each([5, 5000])('every fixed-row slab has near < far (cam.distance = %d)', (distance) => {
    const slabs = deriveSlabs(baseInput({ cam: makeCam(distance) }));
    for (const index of [NEAR0, COSMO]) {
      expect(slabs[index]!.near).toBeLessThan(slabs[index]!.far);
    }
  });

  it('the near-field row is origin-relative and f64; the cosmological row is not origin-relative and f32', () => {
    const slabs = deriveSlabs(baseInput({ cam: makeCam(100) }));
    expect(slabs[0]?.frame).toEqual({ kind: 'world-mpc', originRelative: true });
    expect(slabs[0]?.precision).toBe('f64');
    expect(slabs[0]?.reversedZ).toBe(true);
    expect(slabs[1]?.frame).toEqual({ kind: 'world-mpc', originRelative: false });
    expect(slabs[1]?.precision).toBe('f32');
    expect(slabs[1]?.reversedZ).toBe(false);
  });

  it.each([250, 5000])(
    'the near-field row uses an adaptive near/far derived from cam.distance (%d)',
    (distance) => {
      const slabs = deriveSlabs(baseInput({ cam: makeCam(distance) }));
      const { near, far } = foregroundFrustum(distance);
      expect(slabs[0]?.near).toBe(near);
      expect(slabs[0]?.far).toBe(far);
    },
  );

  it('with no drawn star spheres, NEAR0 gets a zero-width distanceRangeM', () => {
    const slabs = deriveSlabs(baseInput({ cam: makeCam(250), starSphereRangeM: null }));
    expect(slabs[0]?.distanceRangeM).toEqual([0, 0]);
  });

  it("NEAR0's distanceRangeM is exactly the caller's starSphereRangeM when spheres are drawn", () => {
    const range: readonly [number, number] = [1.2e9, 3.4e9];
    const slabs = deriveSlabs(baseInput({ cam: makeCam(250), starSphereRangeM: range }));
    expect(slabs[0]?.distanceRangeM).toEqual(range);
  });

  it("the near row's vp is the origin-relative computeForegroundViewProj product", () => {
    const distance = 250;
    const cam = makeCam(distance);
    const slabs = deriveSlabs(baseInput({ cam }));
    // Pin the util as the derivation: rebuild the matrix from the same camera
    // inputs and assert Float64Array equality. A reimplemented-but-equal matrix
    // would drift the moment computeForegroundViewProj changes, so equality
    // against the live util — not a hand-rolled expectation — is the contract.
    const { near, far } = foregroundFrustum(distance);
    const expected = computeForegroundViewProj({
      eyeMpc: cam.position,
      targetMpc: cam.target,
      up: [0, 1, 0],
      renderOrigin: RENDER_ORIGIN_MPC,
      fovYRad: cam.fovYRad,
      aspect: cam.aspect,
      near,
      far,
      // NEAR0 is reversed-Z (`SLAB_REVERSED_Z[NEAR0] === true`), so the derived
      // vp must be the infinite-far reversed projection — pin the util with the
      // same flag deriveSlabs passes, else this equality drifts.
      reversedZ: true,
    });
    expect(slabs[0]?.vp).toBeInstanceOf(Float64Array);
    expect(Array.from(slabs[0]!.vp)).toEqual(Array.from(expected));
  });

  it('the cosmological row preserves the given vp exactly', () => {
    const cosmoVp = makeCosmoVp();
    const slabs = deriveSlabs(baseInput({ cam: makeCam(100), cosmoVp }));
    // Widening f32 -> f64 is exact, so narrowing back to f32 round-trips
    // byte-equal — this is what lets `slabViewOf` skip a COSMO special case.
    expect(Array.from(Float32Array.from(slabs[1]!.vp))).toEqual(Array.from(cosmoVp));
  });

  it('with a pivot radius, keys the near-field bracket off ALTITUDE, not raw distance', () => {
    // At a realistic close-approach altitude (50 m, comfortably above the
    // ~15 m descent floor) the pivot's own radius utterly dominates raw
    // `cam.distance`, so this is the actual regime the bug lived in: two very
    // differently sized pivots at the SAME altitude must still get the same
    // near/far.
    const altitudeMpc = 0.05 * SCALE_UNITS.KM_TO_MPC; // 50 m
    const moonletRadiusMpc = 10 * SCALE_UNITS.KM_TO_MPC;
    const earthRadiusMpc = 6371 * SCALE_UNITS.KM_TO_MPC;
    const a = deriveSlabs(
      baseInput({
        cam: makeCam(moonletRadiusMpc + altitudeMpc),
        pivotRadiusMpc: moonletRadiusMpc,
      }),
    );
    const b = deriveSlabs(
      baseInput({ cam: makeCam(earthRadiusMpc + altitudeMpc), pivotRadiusMpc: earthRadiusMpc }),
    );
    const relDiff = Math.abs(a[0]!.near - b[0]!.near) / a[0]!.near;
    expect(relDiff).toBeLessThan(1e-9);
    expect(a[0]!.far).toBe(b[0]!.far);

    // Without the fix (keying off raw `cam.distance`), Earth's pivot would get
    // a near plane over an order of magnitude farther out than the
    // altitude-keyed one — comfortably past the 50 m altitude, i.e. the
    // ground-clipping bug.
    const rawDistanceBracket = foregroundFrustum(earthRadiusMpc + altitudeMpc);
    expect(rawDistanceBracket.near / b[0]!.near).toBeGreaterThan(10);
  });

  it('with no pivot radius, behaves exactly as before — raw distance', () => {
    const distance = 250;
    const slabs = deriveSlabs(baseInput({ cam: makeCam(distance) }));
    const { near, far } = foregroundFrustum(distance);
    expect(slabs[0]!.near).toBe(near);
    expect(slabs[0]!.far).toBe(far);
  });

  it('emits one body row per visible body, back-to-front', () => {
    const far = makePlanet({ id: 'body-far' });
    const mid = makePlanet({ id: 'body-mid' });
    const near = makePlanet({ id: 'body-near' });

    const poseByBody = new Map<string, BodyRelativePose>([
      ['body-far', { eyeRelBodyM: [1e10, 0, 0], basisM: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
      ['body-mid', { eyeRelBodyM: [1e8, 0, 0], basisM: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
      ['body-near', { eyeRelBodyM: [1e6, 0, 0], basisM: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
    ]);
    const pose: BodyPoseProvider = (bodyId) => poseByBody.get(bodyId) ?? null;

    // Deliberately NOT in distance order, so the assertion below exercises the
    // sort rather than coincidentally matching input order.
    const slabs = deriveSlabs(baseInput({ pose, visibleBodies: [near, far, mid] }));

    expect(slabs).toHaveLength(2 + 3);
    expect(slabs[2]!.distanceRangeM[0]).toBeGreaterThan(slabs[3]!.distanceRangeM[0]);
    expect(slabs[3]!.distanceRangeM[0]).toBeGreaterThan(slabs[4]!.distanceRangeM[0]);
    expect(slabs[2]?.frame).toEqual({ kind: 'body-m', bodyId: 'body-far' });
    expect(slabs[3]?.frame).toEqual({ kind: 'body-m', bodyId: 'body-mid' });
    expect(slabs[4]?.frame).toEqual({ kind: 'body-m', bodyId: 'body-near' });
    for (const slab of slabs.slice(2)) {
      expect(slab.precision).toBe('f64');
      expect(slab.reversedZ).toBe(true);
    }
  });

  it('drops a body whose pose is null this frame (culled)', () => {
    const body = makePlanet({ id: 'culled-body' });
    const slabs = deriveSlabs(baseInput({ pose: NO_POSE, visibleBodies: [body] }));
    expect(slabs).toHaveLength(2);
  });

  it('brackets a body row around its drawn radius — dM=1e9 m, rMaxM=1e5 m', () => {
    const body = makePlanet({ id: 'bracket-body', radiusM: 1e5 });
    const pose: BodyPoseProvider = () => ({
      eyeRelBodyM: [1e9, 0, 0],
      basisM: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    });
    const slabs = deriveSlabs(baseInput({ pose, visibleBodies: [body] }));
    const row = slabs[2]!;
    // Hand-written, not re-derived from bodyDrawRadiusM/dM inside the test.
    expect(row.near).toBe(999900000);
    expect(row.distanceRangeM).toEqual([999900000, 1000100000]);
    // far is +∞ (spec §4) — distanceRangeM[1] carries the finite bound instead.
    expect(row.far).toBe(Infinity);
  });

  it("floors a body row's near plane at MIN_NEAR_M when the camera is inside the drawn radius", () => {
    const body = makePlanet({ id: 'inside-body', radiusM: 1000 });
    const pose: BodyPoseProvider = () => ({
      eyeRelBodyM: [100, 0, 0], // dM = 100 m < rMaxM = 1000 m
      basisM: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    });
    const slabs = deriveSlabs(baseInput({ pose, visibleBodies: [body] }));
    const row = slabs[2]!;
    expect(row.near).toBe(MIN_NEAR_M);
    expect(row.distanceRangeM[0]).toBe(0);
  });

  it("builds a body row's vp about the eye — RTC-native, no translation, body centre projects to screen centre", () => {
    const body = makePlanet({ id: 'eye-body', radiusM: 1e5 });
    // right=[1,0,0], up=[0,1,0], forward=[0,0,-1] — an orthonormal basis
    // satisfying right×up=−forward (this codebase's camera-basis handedness,
    // per `imagePlaneBasis`), with the camera looking straight down −Z.
    // eyeRelBodyM = −dM·forward places the body centre exactly along the
    // camera's forward axis, dM = 1e9 m out.
    const dM = 1e9;
    const eyeRelBodyM: [number, number, number] = [0, 0, dM];
    const basisM: BodyRelativePose['basisM'] = [1, 0, 0, 0, 1, 0, 0, 0, -1];
    const pose: BodyPoseProvider = () => ({ eyeRelBodyM, basisM });

    const slabs = deriveSlabs(baseInput({ pose, visibleBodies: [body] }));
    const vp = slabs[2]!.vp;

    // A translation leaking into `view` would show up in `vp`'s column 3
    // (indices 12–15, column-major): the X/Y entries (12, 13) pick up a
    // nonzero term proportional to the leaked translation, and w's own row
    // (15) — normally 0 for a projection with no view translation — would
    // gain a nonzero `-tz` term. Index 14 is NOT part of this check: it is
    // the projection's own near-plane constant (here exactly `near`,
    // legitimately nonzero) and stays that way with or without a
    // translation bug, so asserting it against 0 would be a false claim.
    expect(vp[12]).toBe(0);
    expect(vp[13]).toBe(0);
    expect(vp[15]).toBe(0);

    // The body centre, expressed relative to the eye, is -eyeRelBodyM.
    // `vec3d.transformMat4` treats the input as a w=1 point and divides
    // through by the resulting clip-w internally, so the result IS the NDC
    // x/y — no manual perspective divide needed here.
    const bodyCentreRelEye: [number, number, number] = [
      -eyeRelBodyM[0],
      -eyeRelBodyM[1],
      -eyeRelBodyM[2],
    ];
    const ndc = vec3d.transformMat4(bodyCentreRelEye, vp);
    expect(ndc[0]).toBeCloseTo(0, 9);
    expect(ndc[1]).toBeCloseTo(0, 9);
  });
});

describe('slabName', () => {
  it('names the fixed rows and body rows by painter ordinal', () => {
    expect(slabName(NEAR0)).toBe('NEAR0');
    expect(slabName(COSMO)).toBe('COSMO');
    expect(slabName(2)).toBe('BODY[0]');
    expect(slabName(5)).toBe('BODY[3]');
  });
});

describe('foregroundChainOrder', () => {
  it('sorts NEAR0 and body rows back-to-front, excluding COSMO', () => {
    const far = makePlanet({ id: 'body-far' });
    const near = makePlanet({ id: 'body-near' });
    const poseByBody = new Map<string, BodyRelativePose>([
      ['body-far', { eyeRelBodyM: [1e10, 0, 0], basisM: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
      ['body-near', { eyeRelBodyM: [1e6, 0, 0], basisM: [1, 0, 0, 0, 1, 0, 0, 0, 1] }],
    ]);
    const pose: BodyPoseProvider = (bodyId) => poseByBody.get(bodyId) ?? null;
    // A starSphereRangeM that puts the Sun's slab BETWEEN the two bodies —
    // the §7.1 ordering case (frame kind and painter position are independent
    // axes).
    const slabs = deriveSlabs(
      baseInput({ pose, visibleBodies: [near, far], starSphereRangeM: [1e8, 1e8] }),
    );
    expect(foregroundChainOrder(slabs)).toEqual([2, NEAR0, 3]);
  });
});

describe('slabViewOf', () => {
  function makeReadyCtx(overrides: Partial<ReadyFrameContext> = {}): ReadyFrameContext {
    const cam = makeCam(100);
    const cosmoVp = makeCosmoVp();
    const slabs = deriveSlabs(baseInput({ cam, cosmoVp }));
    return {
      isReady: true,
      renderedTargets: new Set<string>(),
      cam,
      vp: cosmoVp,
      canvasSize: { width: 1920, height: 1080 },
      drawCamPos: [cam.position[0], cam.position[1], cam.position[2]],
      drawPxPerRad: 1000,
      nowMs: 0,
      simDays: 0,
      fovYRad: cam.fovYRad,
      focusBlend: 0,
      visibleSourceMask: 0xffffffff,
      focus: { blend: 0 } as unknown as ReadyFrameContext['focus'],
      galaxyPointRenderer: {} as unknown as ReadyFrameContext['galaxyPointRenderer'],
      renderTargets: {} as unknown as ReadyFrameContext['renderTargets'],
      texturedDisks: {} as unknown as ReadyFrameContext['texturedDisks'],
      slabs,
      ...overrides,
    };
  }

  it('slabViewOf(ctx, COSMO).vp is byte-equal to ctx.vp', () => {
    const ctx = makeReadyCtx();
    const view = slabViewOf(ctx, COSMO);
    expect(Array.from(view.vp)).toEqual(Array.from(Float32Array.from(ctx.vp)));
  });

  it('slabViewOf viewportPx mirrors canvasSize', () => {
    const ctx = makeReadyCtx({ canvasSize: { width: 800, height: 600 } });
    const view = slabViewOf(ctx, COSMO);
    expect(view.viewportPx).toEqual([800, 600]);
  });

  it('slabViewOf(ctx, NEAR0) exposes the adaptive near/far slab row', () => {
    const cam = makeCam(100);
    const ctx = makeReadyCtx({ cam });
    const view = slabViewOf(ctx, NEAR0);
    const { near, far } = foregroundFrustum(cam.distance);
    expect(view.slab.near).toBe(near);
    expect(view.slab.far).toBe(far);
  });

  it('throws for an index with no matching slab row', () => {
    const ctx = makeReadyCtx();
    expect(() => slabViewOf(ctx, 99)).toThrow();
  });
});
