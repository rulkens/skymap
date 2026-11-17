/**
 * produceAntiqueMilkyWayNames — the antique look's names across the Milky Way seen
 * from outside (`ANTIQUE_MILKY_WAY_NAMES`): arms, spur, bar, bulge and the Sun, each
 * fixed on the generated disc and faded in by `antiqueMilkyWayNameAlpha`. With the
 * look off it returns before any work; `antiqueLabel` sets the type. The handed
 * `label:milkyWay` value is the "You are here" band, still near 0.1 at a face-on
 * 40 kpc, so the row takes only its gate, not its fade.
 */

import type { Label2D } from '../../../../@types/rendering/Label2D';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { LayerScreenLabel } from '../../../../@types/engine/layer/LayerScreenLabel';
import { vec3 } from 'wgpu-matrix';
import { ANTIQUE_MILKY_WAY_NAMES } from '../../../../data/labels/antiqueMilkyWayNames';
import { MILKY_WAY_GALAXY_PARAMS } from '../../../../data/milkyWay/milkyWayGalaxyParams';
import { describeGalaxy } from '../../../../services/engine/galaxyGenerator/shared/describeGalaxy';
import { milkyWayModelCached } from '../../cloud/render/milkyWayModelCached';
import { milkyWayPickId } from '../../picking/present/milkyWayPickId';
import { milkyWayDiscPoint } from '../utils/milkyWayDiscPoint';
import { antiqueMilkyWayNameAlpha } from '../utils/antiqueMilkyWayNameAlpha';
import { MILKY_WAY_LABEL_STYLE } from './milkyWayLabelStyle';

const NONE = { labels: [], awake: false } as const;

export function produceAntiqueMilkyWayNames(
  pickCode: number,
): LayerScreenLabel<'milkyWay'>['produceLabels'] {
  const geometry = describeGalaxy(MILKY_WAY_GALAXY_PARAMS);
  const anchors = ANTIQUE_MILKY_WAY_NAMES.map((name): Vec3 => {
    const p = vec3.transformMat4(milkyWayDiscPoint(name.at, geometry), milkyWayModelCached());
    return [p[0]!, p[1]!, p[2]!];
  });
  const subjectId = milkyWayPickId(pickCode);

  return (state, ctx) => {
    const alpha = antiqueMilkyWayNameAlpha(state, ctx);
    if (alpha <= 0) return NONE;
    const labels = ANTIQUE_MILKY_WAY_NAMES.map(
      (name, i): Label2D => ({
        id: name.id,
        text: name.name,
        worldPos: anchors[i]!,
        font: 'cormorant',
        pixelSize: 0,
        worldEmMpc: MILKY_WAY_LABEL_STYLE.worldEmMpc,
        alignX: 'center',
        alignY: name.alignY ?? 'center',
        fadeAlpha: alpha,
        // Engraved over the disc it names, as the Earth's names are over the globe.
        occludeWeight: 0,
        // Over every galaxy name; the table's order breaks a crowd.
        declutterPriority: Number.MAX_SAFE_INTEGER - i,
        subjectId,
      }),
    );
    return { labels, awake: false };
  };
}
