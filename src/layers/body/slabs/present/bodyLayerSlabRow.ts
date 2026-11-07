/**
 * bodyLayerSlabRow — the slab row the body Layer declares for one of its
 * bodies: drawn out to its outermost shell (`bodyDrawRadiusM`), active inside
 * the foreground band measured from the body itself, and, for an atmosphere
 * body, hosting the `insideAtmosphere` line inside its `atmosphereInsideBand`,
 * the one rule the shell's `inside` reads too. Earth and every body the antique
 * look reads an albedo map of (`ANTIQUE_ALBEDO_MASK`) also host `surfaceMask`.
 */

import type { SlabRow } from '../../../../@types/engine/frame/SlabRow';
import type { SceneBody } from '../../../../@types/scene/SceneBody';
import { FOREGROUND_RECEDE_FADE_BAND } from '../../../../data/bands/foregroundRecedeFadeBand';
import { ANTIQUE_ALBEDO_MASK } from '../../../../data/rendering/antiqueAlbedoMask';
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
      ...(body.id === 'earth' || body.id in ANTIQUE_ALBEDO_MASK
        ? [{ line: 'surfaceMask' as const }]
        : []),
    ],
  };
}
