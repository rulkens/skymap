/**
 * partitionStarsByResolution — unit tests for the star LOD partition.
 *
 * The partition is the ONE branch point deciding whether a star draws as a
 * foreground sphere (`starSpheresLayer`) or an additive backdrop point
 * (`starPointsLayer`), so these tests pin the behaviours the layers lean
 * on: apparent size drives membership for EVERY star — the Sun included, so
 * a sub-resolve Sun demotes to a point instead of vanishing — with one
 * narrow degenerate guard: at zero camera distance (`apparentSizePx`'s
 * distance<=0 guard returns 0) the star the camera sits inside resolves
 * unconditionally.
 *
 * Fixtures come from the real `SCENE_STARS` seed, paired with the real
 * `SCENE_ANCHORS` positions the frame resolves, so the predicate is
 * exercised against real solar radii and parsec-scale positions rather
 * than round numbers a unit bug could accidentally satisfy.
 */

import { describe, it, expect } from 'vitest';

import {
  partitionStarsByResolution,
  STAR_RESOLVE_PX,
} from '../../../../src/services/engine/frame/partitionStarsByResolution';
import { SCENE_STARS } from '../../../../src/data/bodies/sceneStars';
import { SCENE_ANCHORS } from '../../../../src/data/bodies/sceneAnchors';
import { SCALE_UNITS } from '../../../../src/data/scaleUnits';
import type { PositionedStar } from '../../../../src/@types/scene/PositionedStar';
import type { Vec3 } from '../../../../src/@types/math/Vec3';

const ANCHOR_POS = new Map(SCENE_ANCHORS.map((anchor) => [anchor.id, anchor.positionMpc]));

/** The record + the position the frame resolves for it, as the layers pair them. */
const POSITIONED: readonly PositionedStar[] = SCENE_STARS.map((star) => ({
  ...star,
  positionMpc: ANCHOR_POS.get(star.id)!,
}));

const byId = (id: string) => POSITIONED.find((star) => star.id === id)!;
const SUN = byId('sun');
const PROXIMA = byId('proxima-centauri');
const SIRIUS = byId('sirius');

const VIEWPORT_HEIGHT_PX = 720;
const FOV_Y_RAD = Math.PI / 3;

/**
 * A camera half an AU from the given position: a sphere the size of the near
 * fixture (Sirius, 1.71 R☉) at that range subtends tens of pixels in a 720-px,
 * 60°-fov viewport — comfortably above STAR_RESOLVE_PX — while every star
 * parsecs away stays sub-pixel.
 */
function halfAuFrom(positionMpc: Readonly<Vec3>): Vec3 {
  return [positionMpc[0] + 0.5 * SCALE_UNITS.AU_TO_MPC, positionMpc[1], positionMpc[2]];
}

describe('partitionStarsByResolution', () => {
  it('partitionStarsByResolution puts a near large star in spheres and a far small star in points', () => {
    // Membership comes purely from the apparent-size threshold: the camera
    // hovers half an AU off Sirius (1.71 R☉, resolves) while the smaller
    // Proxima (0.154 R☉) sits parsecs away and stays sub-pixel.
    const { spheres, points } = partitionStarsByResolution({
      stars: [SIRIUS, PROXIMA],
      camPosMpc: halfAuFrom(SIRIUS.positionMpc),
      thresholdPx: STAR_RESOLVE_PX,
      viewportHeightPx: VIEWPORT_HEIGHT_PX,
      fovYRad: FOV_Y_RAD,
    });

    expect(spheres.map((star) => star.id)).toEqual(['sirius']);
    expect(points.map((star) => star.id)).toEqual(['proxima-centauri']);
    // Identity preserved — the layers read positionMpc/color off the same
    // seed records, never copies.
    expect(spheres[0]).toBe(SIRIUS);
    expect(points[0]).toBe(PROXIMA);
  });

  it('demotes a sub-resolve Sun to the points branch so it stays visible', () => {
    // Camera parked half an AU off Sirius: the Sun is ~2.6 pc away, deep
    // sub-pixel. It must land in POINTS — a blanket always-resolve override
    // kept it a (sub-pixel, invisible) sphere here, which is exactly the "no
    // Sun when zoomed out" bug: never a point, its sphere unseeable.
    const { spheres, points } = partitionStarsByResolution({
      stars: [SUN, PROXIMA, SIRIUS],
      camPosMpc: halfAuFrom(SIRIUS.positionMpc),
      thresholdPx: STAR_RESOLVE_PX,
      viewportHeightPx: VIEWPORT_HEIGHT_PX,
      fovYRad: FOV_Y_RAD,
    });

    expect(points.map((star) => star.id)).toEqual(['sun', 'proxima-centauri']);
    expect(spheres.map((star) => star.id)).toEqual(['sirius']);
  });

  it('resolves a star at degenerate zero camera distance', () => {
    // Camera exactly ON the Sun: apparentSizePx's distance<=0 guard returns 0,
    // so a bare size test would demote the star the camera sits inside — the
    // narrow degenerate guard keeps it a sphere.
    const { spheres, points } = partitionStarsByResolution({
      stars: POSITIONED,
      camPosMpc: SUN.positionMpc,
      thresholdPx: STAR_RESOLVE_PX,
      viewportHeightPx: VIEWPORT_HEIGHT_PX,
      fovYRad: FOV_Y_RAD,
    });

    expect(spheres).toEqual([SUN]);
    // Disjoint + exhaustive: everyone else is a point, nobody is dropped.
    expect(points).toHaveLength(POSITIONED.length - 1);
    expect(points).not.toContain(SUN);
  });
});
