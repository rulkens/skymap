/**
 * logCameraState — verifies the `l`-key dump stays lossless and reports what
 * it's handed. The caller (engine.ts / makeReconcileEffects.ts) is now
 * responsible for assembling the LIVE camera/focus/simDays; this module just
 * trusts and serialises them, so these tests feed it synthetic live-looking
 * values rather than any stale `state.cam`/`SelectionRow` register.
 *
 * The lossless-round-trip regression this guards: the previous implementation
 * ran `distance`/`target` through `toPrecision(8)` and `yaw`/`pitch`/`fovYRad`
 * through `toFixed(4)`, which rounds away exactly the sub-radian pitch
 * difference that separates a grazing surface-tile view from a clean one.
 * `JSON.parse` round-tripping the logged blob back to the input numbers is the
 * property that catches a reintroduced `toFixed`/`toPrecision` call.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

import { logCameraState } from '../../../../src/services/engine/helpers/logCameraState';
import { createOrbitCamera } from '../../../../src/utils/camera/createOrbitCamera';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { SelectionRow } from '../../../../src/@types/engine/SelectionRow';

const EARTH_RADIUS_KM = 6371;
const EARTH_RADIUS_MPC = EARTH_RADIUS_KM * SCALE_UNITS.KM_TO_MPC;
const SIM_DAYS = 2461272.948547558; // an arbitrary live "now" instant, far from J2000

function fakeCanvas(cssWidth: number, cssHeight: number): HTMLCanvasElement {
  return { clientWidth: cssWidth, clientHeight: cssHeight } as unknown as HTMLCanvasElement;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('logCameraState', () => {
  it('logs one JSON blob whose numbers round-trip at full f64 precision', () => {
    vi.stubGlobal('window', { devicePixelRatio: 2 });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    // A pitch this close to -pi/2 needs more than 4 decimal digits to stay
    // distinguishable from straight-down — exactly the grazing-angle regime
    // the surface-tile bug lives in. `target` is scaled like a REAL scene
    // body's heliocentric position (~1e-12 Mpc, see deriveBodyStates), not an
    // arbitrary O(1) Mpc point: at O(1) Mpc, `target + distance·dir` loses the
    // ~1e-16 Mpc (50 m) altitude signal to float64 rounding before the
    // subtraction below ever runs — the same "wrong currency" trap
    // `camPosLocal.ts`'s header calls out for body-relative math.
    const cam = createOrbitCamera({
      target: [4.302223432556485e-12, -8.589504546518782e-13, 1.865304005019885e-12],
      distance: EARTH_RADIUS_MPC + 0.05 * SCALE_UNITS.KM_TO_MPC,
      yaw: 0.123456789012345,
      pitch: -1.5707432198765432,
      fovYRad: 0.7853981633974483,
      aspect: 16 / 9,
      near: 1e-20,
      far: 1e4,
    });
    // The camera's target sits at the pivot; a live focus row's positionMpc
    // is fed as the exact same point so cameraToBodyCenterMpc reduces to
    // cam.distance and the altitude assertion below stays simple.
    const focus: SelectionRow = {
      type: 'body',
      id: 'earth',
      label: 'Earth',
      positionMpc: cam.target,
      radiusKm: EARTH_RADIUS_KM,
    };

    logCameraState(cam, fakeCanvas(1920, 1080), focus, SIM_DAYS);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [, blob] = logSpy.mock.calls[0] as [string, string];
    const out = JSON.parse(blob);

    expect(out.target).toEqual(cam.target);
    expect(out.yaw).toBe(cam.yaw);
    expect(out.pitch).toBe(cam.pitch);
    expect(out.distanceMpc).toBe(cam.distance);
    expect(out.fovYRad).toBe(cam.fovYRad);
    expect(out.worldPositionMpc).toEqual(cam.position);
    expect(out.simDays).toBe(SIM_DAYS);
    expect(out.viewport).toEqual({ cssWidthPx: 1920, cssHeightPx: 1080, devicePixelRatio: 2 });
    expect(out.focus).toEqual(focus);
    expect(out.pivotRadiusMpc).toBe(EARTH_RADIUS_MPC);
    expect(out.derived.cameraToBodyCenterMpc).toBeCloseTo(cam.distance, 12);
    // 0.05 km = 50 m was added to the Earth-radius distance above.
    expect(out.derived.altitudeMeters).toBeCloseTo(50, 3);
  });

  it("derives cameraToBodyCenterMpc from world positions, not cam.distance, when the pivot target and the body's live center disagree", () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cam = createOrbitCamera({
      target: [0, 0, 0],
      distance: 5,
      yaw: 0,
      pitch: 0,
      fovYRad: 0.9,
      aspect: 1,
      near: 0.01,
      far: 100,
    });
    // Live body center offset from the orbit target (e.g. a stale/mismatched
    // pivot) — cam.distance (5) must NOT leak into the derived block.
    const focus: SelectionRow = {
      type: 'body',
      id: 'earth',
      label: 'Earth',
      positionMpc: [3, 4, 0],
      radiusKm: EARTH_RADIUS_KM,
    };

    logCameraState(cam, fakeCanvas(800, 600), focus, SIM_DAYS);

    const [, blob] = logSpy.mock.calls[0] as [string, string];
    const out = JSON.parse(blob);
    // cam.position for this pose is [0, 0, 5]; distance to [3, 4, 0] is
    // sqrt(9+16+25) = sqrt(50).
    expect(out.derived.cameraToBodyCenterMpc).toBeCloseTo(Math.sqrt(50), 12);
    expect(out.derived.cameraToBodyCenterMpc).not.toBeCloseTo(cam.distance, 3);
  });

  it('omits the derived block when the focus has no surface', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const cam = createOrbitCamera({
      target: [0, 0, 0],
      distance: 10,
      yaw: 0,
      pitch: 0,
      fovYRad: 0.9,
      aspect: 1,
      near: 0.01,
      far: 100,
    });

    logCameraState(cam, fakeCanvas(800, 600), { type: 'milkyWay' }, SIM_DAYS);

    const [, blob] = logSpy.mock.calls[0] as [string, string];
    const out = JSON.parse(blob);
    expect(out.pivotRadiusMpc).toBeNull();
    expect(out.derived).toBeNull();
  });

  it('carries the earthSubCamera readout through when supplied, and defaults it to null', () => {
    vi.stubGlobal('window', { devicePixelRatio: 1 });
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const cam = createOrbitCamera({
      target: [0, 0, 0],
      distance: 10,
      yaw: 0,
      pitch: 0,
      fovYRad: 0.9,
      aspect: 1,
      near: 0.01,
      far: 100,
    });

    logCameraState(cam, fakeCanvas(800, 600), { type: 'milkyWay' }, SIM_DAYS, {
      lonDeg: 12.53012,
      latDeg: 55.67021,
      coveredMaxLevel: 19,
    });
    const [, withReadout] = logSpy.mock.calls[0] as [string, string];
    expect(JSON.parse(withReadout).earthSubCamera).toEqual({
      lonDeg: 12.53012,
      latDeg: 55.67021,
      coveredMaxLevel: 19,
    });

    logSpy.mockClear();
    logCameraState(cam, fakeCanvas(800, 600), { type: 'milkyWay' }, SIM_DAYS);
    const [, withoutReadout] = logSpy.mock.calls[0] as [string, string];
    expect(JSON.parse(withoutReadout).earthSubCamera).toBeNull();
  });

  it('prints a single not-ready line and touches neither canvas nor window when the camera is null', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logCameraState(null, fakeCanvas(0, 0), null, SIM_DAYS);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[engine] logCameraState: camera not ready yet');
  });
});
