/**
 * constellationCaptions — one Latin name caption per stick-figure. Anchors
 * sit at parsec distances (~1e-5–1.5e-3 Mpc), inside COSMO's fixed 0.01 Mpc
 * near plane, so a main-director label would be GPU-clipped; these route as
 * `ForegroundCaption`s on the NEAR0 slab instead.
 */

import type { ConstellationsArtifact } from '../../../@types/loading/ConstellationsArtifact';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { ForegroundCaption } from '../../../services/engine/presentation/foregroundCaption';
import { CONSTELLATION_LABEL_STYLE } from './constellationLabelStyle';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { RENDER_ORIGIN_MPC } from '../../../data/renderOrigin';

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
