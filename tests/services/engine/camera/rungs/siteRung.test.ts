/**
 * siteRung — the third rung as the ladder sees it (spec §4.3-§4.7). The
 * conversions are pinned one level down (`sitePoseToBodyArm` / `…FromBodyArm`);
 * what can fail HERE is a cell reading the wrong registry, radius or band edge.
 */

import { describe, it, expect } from 'vitest';

import { CAMERA_RUNGS } from '../../../../../src/services/engine/camera/rungs/cameraRungs';
import { hostOf } from '../../../../../src/services/engine/camera/rungs/hostOf';
import { refoldTo } from '../../../../../src/services/engine/camera/rungs/refoldTo';
import { deriveBodyStates } from '../../../../../src/services/engine/frame/deriveBodyStates';
import { pivotFraming } from '../../../../../src/services/engine/camera/pivotRadiusMpc';
import { siteGroundRadiusM } from '../../../../../src/utils/camera/siteGroundRadiusM';
import { sitePointBodyFixed } from '../../../../../src/utils/camera/sitePointBodyFixed';
import { sitePoseToBodyArm } from '../../../../../src/utils/camera/sitePoseToBodyArm';
import { findByIdOrThrow } from '../../../../../src/utils/object/findByIdOrThrow';
import { SCENE_CELESTIAL_BODIES } from '../../../../../src/data/bodies/sceneCelestialBodies';
import { SCENE_MESH_BODIES } from '../../../../../src/data/bodies/sceneMeshBodies';
import { SURFACE_FIXED_SITES } from '../../../../../src/data/bodies/surfaceFixedSites';
import { DEFAULT_CAMERA_TUNING } from '../../../../../src/data/camera/cameraTuning';
import { ORIENTATION_FRAMES } from '../../../../../src/data/orientation/orientationFrames';
import { DEFAULT_ORIENTATION } from '../../../../../src/data/defaults';
import { CONST_J2000 } from '../../../../../src/data/time/constJ2000';
import { datumOnlyTerrainHeight } from '../../../../../src/utils/camera/datumOnlyTerrainHeight';
import type { BodyId } from '../../../../../src/@types/data/body/BodyId';
import type { BodyState } from '../../../../../src/@types/scene/BodyState';
import type { CameraPose } from '../../../../../src/@types/camera/CameraPose';
import type { FrameOf } from '../../../../../src/@types/camera/FrameOf';
import type { FramedPose } from '../../../../../src/@types/camera/FramedPose';
import type { RungCtx } from '../../../../../src/@types/camera/RungCtx';
import type { SitePose } from '../../../../../src/@types/camera/SitePose';

const B = ORIENTATION_FRAMES[DEFAULT_ORIENTATION];
const BODIES = deriveBodyStates(CONST_J2000) as ReadonlyMap<BodyId, BodyState>;
const SITE_ID = 'curiosity' as BodyId;
const SITE_FRAME: FrameOf['site'] = { site: SITE_ID };
const MARS_FRAME: FrameOf['body'] = { body: 'mars' as BodyId };
const SITE = findByIdOrThrow(SURFACE_FIXED_SITES, SITE_ID, 'siteRung.test');
const ROVER = findByIdOrThrow(SCENE_MESH_BODIES, SITE_ID, 'siteRung.test');
const MARS_R_M = findByIdOrThrow(SCENE_CELESTIAL_BODIES, 'mars', 'siteRung.test').surface
  .datumRadiusM;
/** The baked ground radius under Curiosity (F4) — what the rung anchors on now. */
const SITE_GROUND_R_M = siteGroundRadiusM(SITE, MARS_R_M);
const ROW = CAMERA_RUNGS.site;

function ctxFor(focusBodyId: BodyId | null): RungCtx {
  return {
    bodies: BODIES,
    poseBasis: B,
    upBasis: B,
    terrainHeightAt: datumOnlyTerrainHeight,
    focusBodyId,
    pivot: pivotFraming(null),
    viewportPx: [100, 100],
    fovYRad: Math.PI / 3,
    tuning: DEFAULT_CAMERA_TUNING,
  };
}

const pose = (headingRad: number, elevationRad: number, rangeM: number): SitePose => ({
  siteId: SITE_ID,
  headingRad,
  elevationRad,
  rangeM,
});

/** Well clear of every floor, so a round trip is a round trip and not a clamp. */
const FIXTURES: readonly SitePose[] = [pose(0.4, 0.3, 50), pose(-2, 1.2, 12), pose(3, 0.05, 200)];

const armAt = (rangeM: number): FramedPose<'body'> => ({
  frame: MARS_FRAME,
  pose: sitePoseToBodyArm(pose(0.4, 0.3, rangeM), SITE, SITE_GROUND_R_M),
});

const bandRange = (radii: number): number => radii * ROVER.boundingRadiusM;
const { siteEngageR, siteDisengageR } = DEFAULT_CAMERA_TUNING;
/** Inside the engage edge, between the two edges, outside the release edge. */
const INSIDE = bandRange(siteEngageR * 0.5);
const BETWEEN = bandRange((siteEngageR + siteDisengageR) / 2);
const OUTSIDE = bandRange(siteDisengageR * 1.5);

describe('the site rung in the ladder', () => {
  it('anchors the host arm on the baked ground, where the rover is drawn', () => {
    const ctx = ctxFor(SITE_ID);
    const arm = ROW.toParent({ frame: SITE_FRAME, pose: FIXTURES[0]! }, ctx).pose;
    const expected = sitePointBodyFixed(SITE, SITE_GROUND_R_M);
    expect(arm.anchorLocalM[0]).toBeCloseTo(expected[0], 3);
    expect(arm.anchorLocalM[1]).toBeCloseTo(expected[1], 3);
    expect(arm.anchorLocalM[2]).toBeCloseTo(expected[2], 3);
  });

  it('refoldTo site → world → site reproduces the pose', () => {
    const ctx = ctxFor(SITE_ID);
    for (const start of FIXTURES) {
      const world = refoldTo({ frame: SITE_FRAME, pose: start }, 'absolute', ctx);
      const back = refoldTo(world, SITE_FRAME, ctx);
      const got = back.pose as SitePose;
      // The world arm is heliocentric Mpc, so the metre-scale leg comes back
      // through a ~µm-resolution representation at Mars's distance (the 1 Mpc
      // seam): µm over tens of metres is the bound below, not float epsilon.
      expect(back.frame).toEqual(SITE_FRAME);
      expect(got.rangeM).toBeCloseTo(start.rangeM, 3);
      expect(got.headingRad).toBeCloseTo(start.headingRad, 5);
      expect(got.elevationRad).toBeCloseTo(start.elevationRad, 5);
    }
  });

  it('hostOf answers the host planet for a site frame', () => {
    // Which is what keeps the remembered tilt alive across a world → body →
    // site descent: the tilt memory is keyed by host, never by frame.
    expect(hostOf(SITE_FRAME, ctxFor(null))?.id).toBe('mars');
    expect(hostOf(SITE_FRAME, ctxFor(null))?.radiusM).toBe(MARS_R_M);
  });

  it('a site keyframe round-trips through encode/decode, and target is the zero vector', () => {
    const ctx = ctxFor(null);
    const start = FIXTURES[0]!;
    const world = refoldTo({ frame: SITE_FRAME, pose: start }, 'absolute', ctx);
    const channels = ROW.channels.encode(world.pose as CameraPose, SITE_FRAME, ctx);

    // The tag names the site, so the point is redundant — an authored target
    // would be a second, silently disagreeing statement of where the rung is.
    expect(channels.target).toEqual([0, 0, 0]);
    expect(channels.yaw).toBeCloseTo(start.headingRad, 5);
    expect(channels.pitch).toBeCloseTo(start.elevationRad, 5);
    expect(channels.distance).toBeCloseTo(start.rangeM, 3);

    const decoded = ROW.channels.decode(channels, SITE_FRAME, ctx);
    expect(decoded.frame).toEqual(SITE_FRAME);
    expect(decoded.pose.siteId).toBe(SITE_ID);
    expect(decoded.pose.headingRad).toBeCloseTo(start.headingRad, 5);
    expect(decoded.pose.elevationRad).toBeCloseTo(start.elevationRad, 5);
    expect(decoded.pose.rangeM).toBeCloseTo(start.rangeM, 3);
  });

  it('the site band is hysteretic', () => {
    const ctx = ctxFor(SITE_ID);
    // A pose parked BETWEEN the two edges keeps whichever rung it arrived in;
    // without that gap the rung thrashes every frame.
    expect(ROW.engage(armAt(INSIDE), ctx)).toEqual(SITE_FRAME);
    expect(ROW.engage(armAt(BETWEEN), ctx)).toBeNull();
    expect(ROW.release({ frame: SITE_FRAME, pose: pose(0.4, 0.3, BETWEEN) }, ctx)).toBe(false);
    expect(ROW.release({ frame: SITE_FRAME, pose: pose(0.4, 0.3, OUTSIDE) }, ctx)).toBe(true);
  });

  it('an orbit-driven mesh body never engages the site rung', () => {
    // The non-goal (§1), enforced by the driver kind rather than by a list:
    // Voyager 1 is metres across and would be well inside the band.
    expect(ROW.engage(armAt(INSIDE), ctxFor('voyager1' as BodyId))).toBeNull();
  });
});
