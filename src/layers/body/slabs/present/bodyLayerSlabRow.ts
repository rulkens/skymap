/**
 * bodyLayerSlabRow — the slab row the body Layer declares for one of its
 * bodies: drawn out to its outermost shell (`bodyDrawRadiusM`), active inside
 * the foreground band measured from the body itself, and, for an atmosphere
 * body, hosting the `insideAtmosphere` line inside its `atmosphereInsideBand`,
 * the one rule the shell's `inside` reads too; Earth also hosts `surfaceMask`.
 */

import type { SlabRow } from '../../../../@types/engine/frame/SlabRow';
import type { SceneBody } from '../../../../@types/scene/SceneBody';
import { FOREGROUND_RECEDE_FADE_BAND } from '../../../../data/bands/foregroundRecedeFadeBand';
import { bodyFootprintRadiusM } from '../../../../utils/scene/bodyFootprintRadiusM';
import { atmosphereInsideBand } from '../../atmosphere/present/atmosphereInsideBand';
import { bodyDrawRadiusM } from './bodyDrawRadiusM';

export function bodyLayerSlabRow(body: SceneBody): SlabRow {
  const drawRadiusM = bodyDrawRadiusM(body);
  const band = atmosphereInsideBand(body.id);
  return {
    anchorId: body.id,
    drawRadiusM: () => drawRadiusM,
    footprintRadiusM: bodyFootprintRadiusM(body),
    activeBand: FOREGROUND_RECEDE_FADE_BAND,
    hosts: [
      ...(band === undefined ? [] : [{ line: 'insideAtmosphere' as const, band }]),
      // Earth alone carries an ocean mask (its material map) for the antique look's land row.
      ...(body.id === 'earth' ? [{ line: 'surfaceMask' as const }] : []),
    ],
  };
}
