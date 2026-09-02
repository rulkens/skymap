/**
 * sStarLensedImages — the S-stars as Sgr A* actually images them, plus the
 * membership test keeping `starPointsLayer` and `sStarLensedImagesLayer` from
 * both drawing the same star.
 *
 * The lens pass's sky cubemap is an at-infinity approximation these sources are
 * far too close for, so they get `lensPointSource` per frame, on the EXACT
 * bending angle. No brightness floor and no shadow cull: the exact deflection
 * diverges at the photon sphere, so an image can never land inside the shadow
 * and its magnification reaches nothing continuously — the two guards this row
 * used to need were the two things that made an S-star pop in and out.
 * Positions come back CAMERA-RELATIVE — the frame the point renderer needs.
 */

import type { PositionedStar } from '../../../@types/scene/PositionedStar';
import type { Vec3 } from '../../../@types/math/Vec3';
import { SCENE_S_STARS } from '../../../data/bodies/sceneSStars';
import { lensPointSource } from '../../../utils/physics/lensPointSource';
import { buildSchwarzschildDeflectionLut } from '../../../utils/lensing/buildSchwarzschildDeflectionLut';
import { sampleSchwarzschildDeflection } from '../../../utils/lensing/sampleSchwarzschildDeflection';
import type { SchwarzschildDeflectionLut } from '../../../@types/lensing/SchwarzschildDeflectionLut';

/** Membership IS the identity — the seed table, not a second flag to keep in step. */
export const S_STAR_IDS: ReadonlySet<string> = new Set(SCENE_S_STARS.map((star) => star.id));

/**
 * Denser than the lens pass's 512-texel GPU copy: the fragment lerps a smooth
 * screen-space field, this table gets root-found and differentiated instead, and
 * the near-shadow curvature is exactly where the secondary lives. ~25 ms to
 * build, so it waits for the first frame INSIDE the band rather than import.
 */
const LUT_SAMPLE_COUNT = 4096;
let deflectionLut: SchwarzschildDeflectionLut | null = null;
const deflection = (impactParamRs: number): number => {
  deflectionLut ??= buildSchwarzschildDeflectionLut(LUT_SAMPLE_COUNT);
  return sampleSchwarzschildDeflection(deflectionLut, impactParamRs);
};

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
      deflection,
    })) {
      const { direction } = image;
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
