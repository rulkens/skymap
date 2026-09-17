/**
 * stepRung — the ladder's band tests (spec §2.5, §12-R2). Every fixture places
 * a body at the Mpc origin with the identity orientation, so the eye's
 * distance from the body is just its own magnitude and `h/R` follows from
 * `SCENE_CELESTIAL_BODIES`' `surface.datumRadiusM` directly — no Earth-typed
 * constant anywhere in this file, matching the body-blind predicate under test.
 *
 * Fixture ids ('moon', 'deimos') are widened with `id as BodyId`, the same
 * `SceneBody`-boundary cast `slabs.ts`/`bodySelectionRow.ts` use: `BodyId` is a
 * 5-value settings category, narrower than the ~30 bodies `SCENE_BODIES` seeds.
 */

import { describe, it, expect } from 'vitest';

import { stepRung } from '../../../../../src/services/engine/camera/rungs/stepRung';
import { climbRowFor } from '../../../../../src/services/engine/camera/rungs/climbRowFor';
import { rungKindOf } from '../../../../../src/services/engine/camera/rungs/rungKindOf';
import { DEFAULT_CAMERA_TUNING as TUNING } from '../../../../../src/data/camera/cameraTuning';
import { SCALE_UNITS } from '../../../../../src/data/scaleUnits';
import { SCENE_CELESTIAL_BODIES } from '../../../../../src/data/bodies/sceneCelestialBodies';
import { SCENE_MESH_BODIES } from '../../../../../src/data/bodies/sceneMeshBodies';
import { SURFACE_FIXED_SITES } from '../../../../../src/data/bodies/surfaceFixedSites';
import { findByIdOrThrow } from '../../../../../src/utils/object/findByIdOrThrow';
import { sitePointBodyFixed } from '../../../../../src/utils/camera/sitePointBodyFixed';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { Mat3 } from '../../../../../src/@types/math/Mat3';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { FramedPose } from '../../../../../src/@types/camera/FramedPose';
import type { RungCtx } from '../../../../../src/@types/camera/RungCtx';

const EARTH_RADIUS_M = 6371000;
const DEIMOS_RADIUS_M = 6000;
const MOON_RADIUS_M = 1737000;

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const m = (metres: number): number => metres * SCALE_UNITS.M_TO_MPC;
const bodyId = (id: string): BodyId => id as BodyId;

function bodyState(positionMpc: Vec3): BodyState {
  return { positionMpc, orientation: IDENTITY, meanAnomalyRad: 0 };
}

// Body-at-origin: the eye's Mpc magnitude alone sets the altitude, so
// `hOverR` below is exact arithmetic, not a fixture approximation.
function bodyStateAtOrigin(): BodyState {
  return bodyState([0, 0, 0]);
}

// eye at `hOverR` altitude ratios above a body of `radiusM`, along +x.
function eyeAt(radiusM: number, hOverR: number): Vec3 {
  return [m(radiusM * (1 + hOverR)), 0, 0];
}

// Zero-distance orbit pose: `eyeMpcOf` answers the target itself, so the eye
// the band test reads is the fixture's own vector, bit for bit.
function worldArm(eyeMpc: Vec3): FramedPose<'absolute'> {
  return { frame: 'absolute', pose: { target: eyeMpc, yaw: 0, pitch: 0, distance: 0 } };
}

// Eye on +x with the identity basis, so the sightline (+z) misses the body and
// `toWorldArm`'s grazing branch reconstructs this exact eye — the altitude the
// case names is the altitude `release` measures.
function bodyArm(
  id: BodyId,
  radiusM: number,
  hOverR: number,
  dir: Vec3 = [1, 0, 0],
): FramedPose<'body'> {
  const eyeM = radiusM * (1 + hOverR);
  return {
    frame: { body: id },
    pose: {
      bodyId: id,
      anchorLocalM: [0, 0, 0],
      eyeRelAnchorM: [dir[0] * eyeM, dir[1] * eyeM, dir[2] * eyeM],
      basisLocal: IDENTITY,
    },
  };
}

function ctxFor(bodies: ReadonlyMap<BodyId, BodyState>, focusBodyId: BodyId | null): RungCtx {
  return {
    bodies,
    poseBasis: IDENTITY,
    upBasis: IDENTITY,
    focusBodyId,
    pivot: { radiusMpc: null, floorMpc: 0 },
    viewportPx: [1920, 1080],
    fovYRad: 1,
    tuning: TUNING,
  };
}

describe('stepRung', () => {
  it('engages the nearest body below the engage threshold', () => {
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const next = stepRung(
      worldArm(eyeAt(EARTH_RADIUS_M, TUNING.engageHR * 0.95)),
      ctxFor(bodyStates, null),
    );
    expect(next).toEqual({ body: 'earth' });
  });

  it('holds the world arm above the engage threshold', () => {
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const next = stepRung(
      worldArm(eyeAt(EARTH_RADIUS_M, TUNING.engageHR * 1.05)),
      ctxFor(bodyStates, null),
    );
    expect(next).toBe('absolute');
  });

  it('holds an engaged body arm until disengage, from both directions', () => {
    const { engageHR, disengageHR } = TUNING;
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const current = { body: bodyId('earth') };
    const ctx = ctxFor(bodyStates, null);

    // Approaching disengage from below (h/R rising through the engaged band).
    expect(stepRung(bodyArm(current.body, EARTH_RADIUS_M, engageHR * 0.5), ctx)).toEqual(current);
    expect(stepRung(bodyArm(current.body, EARTH_RADIUS_M, disengageHR * 0.97), ctx)).toEqual(
      current,
    );
    // Crossing disengage releases the arm.
    expect(stepRung(bodyArm(current.body, EARTH_RADIUS_M, disengageHR * 1.03), ctx)).toBe(
      'absolute',
    );

    // Symmetric check from a fresh high altitude directly (the "from both
    // directions" half — the predicate holds the SAME regardless of how the
    // pose arrived at that h/R, since it reads only current + geometry).
    expect(
      stepRung(bodyArm(current.body, EARTH_RADIUS_M, (engageHR + disengageHR) / 2), ctx),
    ).toEqual(current);
  });

  it('picks the minimising body when two are close, with no focus input', () => {
    // Moon is the closer-in-h/R body, well inside the engage threshold;
    // Earth is parked far enough away that its own h/R stays large. Nothing
    // in the engage cell's inputs names which body is focused, so an
    // unfocused flyby past the nearer body still engages it.
    const eyeMpc: Vec3 = [m(MOON_RADIUS_M * (1 + TUNING.engageHR * 0.5)), 0, 0];
    const bodyStates = new Map<BodyId, BodyState>([
      [bodyId('earth'), bodyState([m(EARTH_RADIUS_M * 5), 0, 0])],
      [bodyId('moon'), bodyStateAtOrigin()],
    ]);
    const next = stepRung(worldArm(eyeMpc), ctxFor(bodyStates, null));
    expect(next).toEqual({ body: 'moon' });
  });

  it('is body-blind: a small moon engages at its own engage threshold', () => {
    const bodyStates = new Map<BodyId, BodyState>([
      [bodyId('deimos'), bodyStateAtOrigin()],
      // Earth present but far away — its own h/R stays huge, so if the
      // predicate ever floored the threshold to Earth's radius the small
      // moon would wrongly fail to engage at its own true, much smaller h/R.
      [bodyId('earth'), bodyState([m(EARTH_RADIUS_M * 1000), 0, 0])],
    ]);
    const next = stepRung(
      worldArm(eyeAt(DEIMOS_RADIUS_M, TUNING.engageHR * 0.5)),
      ctxFor(bodyStates, null),
    );
    expect(next).toEqual({ body: 'deimos' });
  });

  it('a focus on a DIFFERENT body releases the engaged arm at any altitude (round 10)', () => {
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const current = { body: bodyId('earth') };
    const ctx = ctxFor(bodyStates, bodyId('mars'));
    // The user bug: engaged on Earth, search-focus Mars — without this the
    // camera answers only after a manual zoom-out past disengage.
    expect(stepRung(bodyArm(current.body, EARTH_RADIUS_M, TUNING.engageHR * 0.5), ctx)).toBe(
      'absolute',
    );
    expect(stepRung(bodyArm(current.body, EARTH_RADIUS_M, TUNING.disengageHR * 0.97), ctx)).toBe(
      'absolute',
    );
  });

  it('focusing the engaged body itself is a no-op', () => {
    // Mutation guard: with the condition inverted, every re-focus of the
    // engaged body would pop the camera to the world arm.
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const current = { body: bodyId('earth') };
    const ctx = ctxFor(bodyStates, bodyId('earth'));
    expect(stepRung(bodyArm(current.body, EARTH_RADIUS_M, TUNING.engageHR * 0.5), ctx)).toEqual(
      current,
    );
    expect(stepRung(bodyArm(current.body, EARTH_RADIUS_M, TUNING.disengageHR * 0.97), ctx)).toEqual(
      current,
    );
  });

  it('a differing body focus also blocks engage — the release cannot flap', () => {
    // After a focus release the eye is still inside the old body's engage
    // range; if the engage side ignored the focus, the fold would engage on
    // frame N+1 and release again on N+2, committing a flip every frame
    // until the follow ease escapes the band.
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const eye = eyeAt(EARTH_RADIUS_M, TUNING.engageHR * 0.5);
    expect(stepRung(worldArm(eye), ctxFor(bodyStates, bodyId('mars')))).toBe('absolute');
    // The focused body itself still engages normally (the common path:
    // click Earth, wheel in).
    expect(stepRung(worldArm(eye), ctxFor(bodyStates, bodyId('earth')))).toEqual({
      body: 'earth',
    });
  });

  it("a focus in the rung's host subtree keeps the rung while the arm can serve it", () => {
    // Spec §0's premise correction: releasing on any differing focus made the
    // Mars arm unreachable with a rover focused. The eye is a fraction of a
    // planet radius up OVER Curiosity's site — far outside the site band, so
    // this pins Mars holding, not a descent — and above the rover's horizon,
    // which is what bounds the hold (§4.8).
    const marsRadiusM = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'mars', 'test').surface
      .datumRadiusM;
    const site = sitePointBodyFixed(
      findByIdOrThrow(SURFACE_FIXED_SITES, 'curiosity', 'test'),
      marsRadiusM,
    );
    const mag = Math.hypot(site[0], site[1], site[2]);
    const up: Vec3 = [site[0] / mag, site[1] / mag, site[2] / mag];
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('mars'), bodyStateAtOrigin()]]);
    const current = { body: bodyId('mars') };
    const ctx = ctxFor(bodyStates, bodyId('curiosity'));
    expect(stepRung(bodyArm(current.body, marsRadiusM, TUNING.engageHR * 0.5, up), ctx)).toEqual(
      current,
    );
  });

  it('a mesh body never engages, even with the eye inside its bounding sphere', () => {
    // The regression the `boundingRadiusM` rename exists to prevent: a mesh
    // body's radius is a hull-plus-boom sphere, mostly empty space. Reading it
    // as ground put the eye at a huge NEGATIVE h/R — the deepest "altitude" in
    // the scene — so the surface arm engaged beside a boom and the orbit drag
    // snapped to surface damping.
    const petunias = findByIdOrThrow(SCENE_MESH_BODIES, 'petunias', 'test');
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('petunias'), bodyStateAtOrigin()]]);
    const insideM = m(petunias.boundingRadiusM * 0.5);
    expect(stepRung(worldArm([insideM, 0, 0]), ctxFor(bodyStates, bodyId('petunias')))).toBe(
      'absolute',
    );
  });

  it('stepRung moves at most one rung per call', () => {
    const bodyStates = new Map<BodyId, BodyState>([[bodyId('earth'), bodyStateAtOrigin()]]);
    const world = worldArm(eyeAt(EARTH_RADIUS_M, TUNING.engageHR * 0.1));
    const next = stepRung(world, ctxFor(bodyStates, null));
    // Deep inside the band, and still only the rung hanging off the one we
    // started on: a third rung must not be reachable in a single call, or the
    // descent skips the frame the crossing commit is drawn on.
    if (next === 'absolute') throw new Error('expected an engage deep inside the band');
    expect(climbRowFor(next).parent).toBe(rungKindOf(world.frame));
  });
});
