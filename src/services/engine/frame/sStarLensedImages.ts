/**
 * sStarLensedImages — the S-stars as Sgr A* actually images them, plus the
 * membership test keeping `starPointsLayer` and `sStarLensedImagesLayer` from
 * both drawing the same star.
 *
 * The lens pass's sky cubemap is an at-infinity approximation these sources are
 * far too close for, so they get `lensPointSource` per frame. Positions come
 * back CAMERA-RELATIVE — the frame the point renderer's f32 upload needs.
 */

import type { PositionedStar } from '../../../@types/scene/PositionedStar';
import type { Vec3 } from '../../../@types/math/Vec3';
import { SCENE_S_STARS } from '../../../data/bodies/sceneSStars';
import { lensPointSource } from '../../../utils/physics/lensPointSource';
import { CRITICAL_IMPACT_PARAM_RS } from '../../../utils/lensing/criticalImpactParamRs';

/** Membership IS the identity — the seed table, not a second flag to keep in step. */
export const S_STAR_IDS: ReadonlySet<string> = new Set(SCENE_S_STARS.map((star) => star.id));

/**
 * Faintest image worth a draw, as a flux ratio: 1e-3 is 7.5 magnitudes down,
 * far under the additive sprite's visible floor. The "opacity 0 ⇒ no render"
 * house rule — a black sprite still costs a draw. Only ever culls secondaries;
 * the primary's magnification is >= 1 by construction.
 */
const MIN_MAGNIFICATION = 1e-3;

/**
 * A point source ON the caustic magnifies infinitely — a measure-zero geometry
 * that would still narrow to a -Infinity absolute magnitude and NaN the sprite.
 * 1e4 is 10 magnitudes of boost, well past anything the tone-map resolves.
 */
const MAX_MAGNIFICATION = 1e4;

/**
 * Every image of every S-star in `stars` (non-S-stars are ignored, so the caller
 * hands over its whole point partition), ready for `setStars`: `positionMpc` is
 * camera-relative at the SOURCE's own range — deflected, not moved, so the
 * renderer's inverse-square dimming is untouched — and `absMag` carries the flux
 * gain as Δm = −2.5 log10 μ.
 */
export function sStarLensedImages(input: {
  stars: readonly PositionedStar[];
  camPosMpc: Readonly<Vec3>;
  lensPosMpc: Readonly<Vec3>;
  schwarzschildRadiusMpc: number;
}): readonly PositionedStar[] {
  const { stars, camPosMpc, lensPosMpc, schwarzschildRadiusMpc } = input;

  const lensRelCam: Vec3 = [
    lensPosMpc[0] - camPosMpc[0],
    lensPosMpc[1] - camPosMpc[1],
    lensPosMpc[2] - camPosMpc[2],
  ];
  const lensDistMpc = Math.hypot(lensRelCam[0], lensRelCam[1], lensRelCam[2]);
  if (lensDistMpc <= 0) return [];
  const lensAxis: Vec3 = [
    lensRelCam[0] / lensDistMpc,
    lensRelCam[1] / lensDistMpc,
    lensRelCam[2] / lensDistMpc,
  ];
  // Rays aimed inside the photon sphere never reach the eye — the shadow.
  const shadowRad = (CRITICAL_IMPACT_PARAM_RS * schwarzschildRadiusMpc) / lensDistMpc;

  const images: PositionedStar[] = [];
  for (const star of stars) {
    if (!S_STAR_IDS.has(star.id)) continue;
    const rangeMpc = Math.hypot(
      star.positionMpc[0] - camPosMpc[0],
      star.positionMpc[1] - camPosMpc[1],
      star.positionMpc[2] - camPosMpc[2],
    );
    for (const image of lensPointSource({
      eye: camPosMpc,
      lens: lensPosMpc,
      source: star.positionMpc,
      schwarzschildRadius: schwarzschildRadiusMpc,
    })) {
      if (image.magnification < MIN_MAGNIFICATION) continue;
      const { direction } = image;
      const axisCos =
        direction[0] * lensAxis[0] + direction[1] * lensAxis[1] + direction[2] * lensAxis[2];
      if (Math.acos(Math.min(1, Math.max(-1, axisCos))) < shadowRad) continue;
      images.push({
        ...star,
        positionMpc: [
          direction[0] * rangeMpc,
          direction[1] * rangeMpc,
          direction[2] * rangeMpc,
        ] as Vec3,
        absMag: star.absMag - 2.5 * Math.log10(Math.min(MAX_MAGNIFICATION, image.magnification)),
      });
    }
  }
  return images;
}
