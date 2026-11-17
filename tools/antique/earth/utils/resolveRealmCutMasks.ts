/**
 * resolveRealmCutMasks — each cut's shape as polygons: a hand ring closed, or
 * its OpenHistoricalMap relations assembled from the extract and merged, with
 * parts and holes under `minOhmPartKm2` dropped as an atlas engraver dropped
 * them. Refuses an extract whose relations are not at their pinned versions:
 * the pins were re-reviewed, so the extract must be fetched again.
 */

import { readFileSync } from 'node:fs';

import type { OhmElement } from '../@types/OhmElement';
import type { OhmRelationPin } from '../@types/OhmRelationPin';
import type { RealmCut1690 } from '../@types/RealmCut1690';
import type { RealmCell } from '../@types/RealmCell';
import type { RealmCutMask } from '../@types/RealmCutMask';
import { assembleOhmRelation } from './assembleOhmRelation';
import { dissolveCells } from './dissolveCells';
import { dropSmallParts } from './dropSmallParts';

export async function resolveRealmCutMasks(
  cuts: readonly RealmCut1690[],
  ohm: { readonly path: string; readonly pins: readonly OhmRelationPin[] },
  options: { readonly minOhmPartKm2: number; readonly radiusKm: number },
): Promise<RealmCutMask[]> {
  const { elements } = JSON.parse(readFileSync(ohm.path, 'utf8')) as { elements: OhmElement[] };
  const relations = new Map(elements.flatMap((e) => (e.type === 'relation' ? [[e.id, e] as const] : [])));
  const ways = new Map(elements.flatMap((e) => (e.type === 'way' ? [[e.id, e] as const] : [])));
  for (const pin of ohm.pins) {
    const version = relations.get(pin.id)?.version;
    if (version !== pin.version)
      throw new Error(
        `OHM relation ${pin.id} (${pin.name}) is version ${version} in the extract, pinned ${pin.version}: run npm run fetch-ohm-1690`,
      );
  }
  const masks: RealmCutMask[] = [];
  for (const cut of cuts) {
    if ('ring' in cut) {
      masks.push({ units: cut.units, target: cut.target, mask: [[[...cut.ring, cut.ring[0]!]]] });
      continue;
    }
    const parts: RealmCell[] = [];
    for (const id of cut.ohmRelations) {
      const relation = relations.get(id);
      if (!relation) throw new Error(`OHM relation ${id} is not in the extract (pin it in OHM_RELATIONS_1690)`);
      const polygons = await assembleOhmRelation(relation, ways);
      if (polygons.length === 0) throw new Error(`OHM relation ${id} encloses no area`);
      parts.push({ key: 'mask', polygons });
    }
    const merged = (await dissolveCells(parts)).flatMap((cell) => cell.polygons);
    masks.push({
      units: cut.units,
      target: cut.target,
      mask: dropSmallParts(merged, options.minOhmPartKm2, options.radiusKm),
    });
  }
  return masks;
}
