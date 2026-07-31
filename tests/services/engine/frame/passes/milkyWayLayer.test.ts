/**
 * milkyWayLayer — the one registry row whose pick set is NARROWER than its draw
 * set.
 *
 * The impostor's hit target is a single disc sized from the galaxy's physical
 * radius, so its screen footprint grows without bound as the camera closes.
 * Combined with the cross-slab pick fold — which is SLAB-ordered, so any NEAR0
 * hit beats every COSMO galaxy and structure marker regardless of depth — a
 * screen-filling backdrop swallows every click made from inside the disc. The
 * gate closing earlier than `enabled` is what stops that, and nothing else in
 * the suite would notice its removal: the disc still draws either way.
 */

import { describe, it, expect, vi } from 'vitest';

import { milkyWayLayer } from '../../../../../src/services/engine/frame/passes/milkyWayLayer';
import { SCALE_FADE_BANDS } from '../../../../../src/services/engine/presentation/scaleFadeBands';

import type { ReadyFrameContext } from '../../../../../src/@types/engine/frame/ReadyFrameContext';
import type { EngineState } from '../../../../../src/@types/engine/state/EngineState';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/**
 * Toggle on and fully faded in — so both gates reduce to the camera distance.
 *
 * `opacityOf` is a MULTIPLIER in `deriveMilkyWayCloudAlpha`, not a fade-tail
 * fallback OR'd against the toggle, so 0 here would zero the whole gate and
 * make every case below vacuously unpickable.
 */
const STATE = {
  settings: { milkyWay: { enabled: true } },
  subsystems: { fades: { opacityOf: vi.fn(() => 1) } },
} as unknown as EngineState;

function makeCtx(camDistMpc: number): ReadyFrameContext {
  const camPos: Vec3 = [0, 0, camDistMpc];
  return {
    cam: { distance: camDistMpc },
    drawCamPos: camPos,
    fovYRad: Math.PI / 3,
    canvasSize: { width: 1280, height: 720 },
    nowMs: 0,
  } as unknown as ReadyFrameContext;
}

describe('milkyWayLayer pick vs draw', () => {
  it('keeps drawing but stops taking clicks once the camera is inside the disc', () => {
    // Well inside the impostor, and still an order of magnitude outside the
    // 2 kpc approach fade — so this is squarely a frame where the disc is
    // DRAWN at full strength and must nonetheless be unpickable.
    const inside = makeCtx(0.02);
    expect(inside.cam.distance).toBeGreaterThan(SCALE_FADE_BANDS.milkyWayApproach.fullAt);
    expect(milkyWayLayer.enabled(STATE, inside)).toBe(true);
    expect(milkyWayLayer.pickEnabled!(STATE, inside)).toBe(false);

    // Framing the galaxy from outside: draw and pick agree again.
    const outside = makeCtx(0.15);
    expect(milkyWayLayer.enabled(STATE, outside)).toBe(true);
    expect(milkyWayLayer.pickEnabled!(STATE, outside)).toBe(true);
  });

  it('stays unpickable wherever it is invisible — pick is a strict subset of draw', () => {
    // Deep in the approach fade the disc has dissolved against the Gaia
    // starfield. `pickEnabled` composes over `enabled` rather than restating
    // its terms, so an invisible disc cannot come back as a click target.
    const dissolved = makeCtx(SCALE_FADE_BANDS.milkyWayApproach.goneAt / 2);
    expect(milkyWayLayer.enabled(STATE, dissolved)).toBe(false);
    expect(milkyWayLayer.pickEnabled!(STATE, dissolved)).toBe(false);
  });
});
