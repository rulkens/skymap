/**
 * milkyWayLayer — the one registry row whose pick set is NARROWER than its draw
 * set. Its hit target is a disc sized from the galaxy's physical radius, so the
 * footprint grows without bound as the camera closes; with the pick fold being
 * SLAB-ordered (any NEAR0 hit beats every COSMO one regardless of depth), a
 * screen-filling backdrop would swallow every click made from inside the disc.
 * Nothing else in the suite notices the gate's removal — the disc still draws.
 */

import { describe, it, expect, vi } from 'vitest';

import { milkyWayLayer } from '../../../../../src/services/engine/frame/passes/milkyWayLayer';
import { SCALE_FADE_BANDS } from '../../../../../src/services/engine/presentation/scaleFadeBands';

import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { SlabView } from '../../../../../src/@types/engine/frame/SlabView';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

// Neither `enabled` nor `pickEnabled` reads `view` — both derive their answer
// from ctx/state alone — so an opaque stub satisfies the 3-arg signature.
const VIEW_STUB = {} as unknown as SlabView;

// Toggle on and fully faded in, so both gates reduce to camera distance.
// `opacityOf` is a MULTIPLIER in `deriveMilkyWayCloudAlpha`, not a fade-tail
// fallback OR'd against the toggle: 0 here makes every case vacuously unpickable.
const STATE = {
  settings: { milkyWay: { enabled: true } },
  subsystems: {
    fades: { opacityOf: vi.fn(() => 1) },
    clipPlayer: { clipOpacityOf: () => 1 },
  },
} as unknown as EngineState;

function makeCtx(camDistMpc: number): ReadyFrameContext {
  const camPos: Vec3 = [0, 0, camDistMpc];
  return {
    cam: { distance: camDistMpc },
    drawCamPos: camPos,
    fovYRad: Math.PI / 3,
    canvasSize: { width: 1280, height: 720 },
    nowMs: 0,
    // resolveLayerOpacity lerps its recession factor on this; an absent one
    // makes the composed alpha NaN.
    focusBlend: 0,
  } as unknown as ReadyFrameContext;
}

describe('milkyWayLayer pick vs draw', () => {
  it('keeps drawing but stops taking clicks once the camera is inside the disc', () => {
    // Well inside the impostor, still an order of magnitude outside the 2 kpc
    // approach fade: the disc is DRAWN at full strength here.
    const inside = makeCtx(0.02);
    expect(inside.cam.distance).toBeGreaterThan(SCALE_FADE_BANDS.milkyWayApproachSun.fullAt);
    expect(milkyWayLayer.enabled(STATE, inside, VIEW_STUB)).toBe(true);
    expect(milkyWayLayer.pickEnabled!(STATE, inside, VIEW_STUB)).toBe(false);

    // Framing the galaxy from outside: draw and pick agree again.
    const outside = makeCtx(0.15);
    expect(milkyWayLayer.enabled(STATE, outside, VIEW_STUB)).toBe(true);
    expect(milkyWayLayer.pickEnabled!(STATE, outside, VIEW_STUB)).toBe(true);
  });

  it('stays unpickable wherever it is invisible — pick is a strict subset of draw', () => {
    // `pickEnabled` composes over `enabled` rather than restating its terms, so an
    // invisible disc cannot come back as a click target.
    const dissolved = makeCtx(SCALE_FADE_BANDS.milkyWayApproachSun.goneAt / 2);
    expect(milkyWayLayer.enabled(STATE, dissolved, VIEW_STUB)).toBe(false);
    expect(milkyWayLayer.pickEnabled!(STATE, dissolved, VIEW_STUB)).toBe(false);
  });
});
