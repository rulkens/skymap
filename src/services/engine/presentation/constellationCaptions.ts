/**
 * constellationCaptions — the foreground-caption source for the true-3D
 * constellation stick figures: one Latin name per figure at its
 * `labelAnchorPc`.
 *
 * ### Why a foreground caption, not a main-director label
 *
 * The figure anchors sit at parsec distances from the origin (~1e-5 to ~1.5e-3
 * Mpc). The main `cosmoLabelDirector` projects its labels through the COSMO slab,
 * whose near plane is pinned at `COSMO_NEAR_MPC = 0.01` Mpc — so at every camera
 * distance where the constellation band is visible (it fades out by 0.01 Mpc)
 * every anchor sits INSIDE that near plane and gets GPU-clipped. A director
 * label for these names could therefore never draw. This is the same reason the
 * scene-body captions (Earth, the planets, the star map) route through
 * `foregroundLabelsLayer` on the NEAR0 slab instead — see that layer's header
 * and `sceneBodyLabels`. So these are built as `ForegroundCaption`s and merged
 * into the layer's near-field declutter + envelope pass beside the body
 * captions.
 *
 * ### A pure builder — the layer owns fade, gating, and memoization
 *
 * This produces the STATIC caption set from the artifact: positions, name,
 * style, `kind`. It reads no camera and no toggle, so it has nothing to
 * recompute per frame. `foregroundLabelsLayer` memoizes the result on the
 * artifact's identity (it is static once the slot lands), derives each
 * caption's per-frame fade TARGET from `constellationLayerOpacity`, and runs it
 * through the shared declutter + temporal envelope. Keeping the fade in the
 * layer means the names dissolve in lock-step with the stick figures (both
 * read the one `constellationLayerOpacity` home) and a toggle flip fades via the
 * envelope rather than popping.
 */

import type { ConstellationsArtifact } from '../../../@types/loading/ConstellationsArtifact';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { ForegroundCaption } from './foregroundCaption';
import { CONSTELLATION_LABEL_STYLE } from './constellationLabelStyle';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';

/**
 * The fixed IAU count of classical constellations — 88. Reserved on top of the
 * scene-body roster when the foreground caption renderer's buffer capacity is
 * derived (`FOREGROUND_LABEL_CAPACITY`), so a full artifact never silently
 * clamps names off (`setLabels` drops anything past capacity with no error). A
 * named constant, not a bare 88, so the reservation reads as "every
 * constellation" at the derivation site.
 */
export const CONSTELLATION_COUNT = 88;

/**
 * Build one name caption per figure from the demand-loaded artifact. Pure: no
 * camera, no toggle, no fade — the layer applies all three. The artifact is
 * static once loaded, so the layer memoizes this on the artifact's identity.
 */
export function constellationCaptions(artifact: ConstellationsArtifact): ForegroundCaption[] {
  const style = CONSTELLATION_LABEL_STYLE;
  const pcToMpc = SCALE_UNITS.PC_TO_MPC;
  const o = RENDER_ORIGIN_MPC;

  const captions: ForegroundCaption[] = [];
  for (const figure of artifact.constellations) {
    // The anchor ships in PARSECS (near-field stellar scale); scale it into the
    // same NEAR0-origin world Mpc the stick-figure segments live in
    // (buildConstellationInstances) through the single PC_TO_MPC source, then
    // subtract the render origin per the `sceneBodyLabels` foreground contract
    // (a no-op while RENDER_ORIGIN_MPC is the Sun, correct-by-construction if a
    // floating origin ever moves).
    const worldPos: Vec3 = [
      figure.labelAnchorPc[0] * pcToMpc - o[0],
      figure.labelAnchorPc[1] * pcToMpc - o[1],
      figure.labelAnchorPc[2] * pcToMpc - o[2],
    ];
    captions.push({
      id: figure.name,
      kind: 'constellation',
      worldPos,
      // The Latin name verbatim — no abbreviation in v1.
      text: figure.name,
      font: 'cormorant',
      pixelSize: 0, // unused — superseded by the worldEm sizing model
      color: [...style.labelColor],
      worldEmMpc: style.worldEmMpc,
      minPixelSize: style.minPixelSize,
      maxPixelSize: style.maxPixelSize,
      alignX: 'center',
      alignY: 'center',
      outlineColor: [...style.outlineColor],
      outlineEmFrac: style.outlineEmFrac,
    });
  }
  return captions;
}
