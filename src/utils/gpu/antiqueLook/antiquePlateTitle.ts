/**
 * antiquePlateTitle — the cartouche's title this frame and its strength. Titles
 * nest: the chart's (the starry sky, or the universe out among the galaxies),
 * then the widest globe's once it is the subject, then a region of the Earth's
 * under the plate's centre. The deepest level past halfway holds the
 * cartouche, faded by how far it is past halfway and by every deeper level's
 * approach, so a change passes through a blank cartouche and two titles never print together.
 */

import type { Vec2 } from '../../../@types/math/Vec2';
import type { AntiqueTitleKey } from '../../../@types/rendering/AntiqueTitleKey';
import { ANTIQUE_GLOBE_TITLES } from '../../../data/rendering/antiqueGlobeTitles';
import { ANTIQUE_EARTH_TITLE_REGIONS } from '../../../data/rendering/antiqueTitleRegions';
import { smoothstep } from '../../math/smoothstep';
import { antiqueGlobeSubject } from './antiqueGlobeSubject';

export function antiquePlateTitle(input: {
  /** 0 inside the Galaxy (a star chart) to 1 out among the galaxies. */
  readonly cosmos: number;
  /** The widest globe on the plate, and the share of the plate it covers. */
  readonly globe: {
    readonly id: string;
    readonly radiusUnits: number;
    /** The ground's scale under the eye: what a region's title is magnified past. */
    readonly kmPerUnit: number;
    readonly coverage: number;
  } | null;
  /** Where the plate's centre ray meets that globe, degrees; null off it. */
  readonly centreLonLat: Readonly<Vec2> | null;
}): { readonly key: AntiqueTitleKey; readonly weight: number } | null {
  const levels: { key: AntiqueTitleKey; v: number }[] = [
    { key: 'coelum', v: 1 },
    { key: 'universe', v: input.cosmos },
  ];
  const { globe, centreLonLat } = input;
  const row = globe ? ANTIQUE_GLOBE_TITLES[globe.id] : undefined;
  if (globe && row) {
    levels.push({ key: row.key, v: antiqueGlobeSubject(globe, centreLonLat !== null, row) });
    if (globe.id === 'earth' && centreLonLat) {
      const lon = ((((centreLonLat[0] + 180) % 360) + 360) % 360) - 180;
      const lat = centreLonLat[1];
      for (const level of [...ANTIQUE_EARTH_TITLE_REGIONS].reverse()) {
        for (const region of level) {
          const inset = Math.max(
            ...region.boxes.map(([lon0, lon1, lat0, lat1]) =>
              Math.min(lon - lon0, lon1 - lon, lat - lat0, lat1 - lat),
            ),
          );
          if (inset <= 0) continue;
          const v =
            smoothstep(region.kmPerUnit[0], region.kmPerUnit[1], globe.kmPerUnit) *
            smoothstep(0, region.marginDeg, inset);
          levels.push({ key: region.key, v });
          break;
        }
      }
    }
  }
  let k = 0;
  levels.forEach(({ v }, i) => {
    if (v >= 0.5) k = i;
  });
  let weight = k === 0 ? 1 : smoothstep(0.5, 1, levels[k]!.v);
  for (const { v } of levels.slice(k + 1)) weight *= 1 - smoothstep(0, 0.5, v);
  return weight > 0 ? { key: levels[k]!.key, weight } : null;
}
