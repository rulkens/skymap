/**
 * assignRealmPieces — every admin-1 unit as keyed pieces of 1690 land: the
 * cuts listing the unit take their parts first, in order, each from what the
 * earlier ones left; the rest goes to the unit's first matching rule. A cut
 * part under `minPartKm2` stays with the unit (a historical line running
 * beside, not on, the modern edge). Unclaimed land is kept, keyed
 * `unclaimedKey`, so its edges count as shared when the coverage is built.
 */

import type { AdminUnit } from '../@types/AdminUnit';
import type { RealmCell } from '../@types/RealmCell';
import type { RealmCutMask } from '../@types/RealmCutMask';
import type { RealmRule1690 } from '../@types/RealmRule1690';
import { matchRealmRule } from './matchRealmRule';
import { ringAreaKm2 } from './ringAreaKm2';
import { splitPolygonsByMask } from './splitPolygonsByMask';

export function assignRealmPieces(
  units: readonly AdminUnit[],
  rules: readonly RealmRule1690[],
  cuts: readonly RealmCutMask[],
  options: {
    readonly interiorPointOf: (unit: AdminUnit) => readonly [number, number];
    readonly unclaimedKey: string;
    readonly minPartKm2: number;
    readonly radiusKm: number;
  },
): { pieces: RealmCell[]; ruleHits: number[]; cutHits: number[]; unmatched: Map<string, number> } {
  const { interiorPointOf, unclaimedKey, minPartKm2, radiusKm } = options;
  const pieces: RealmCell[] = [];
  const ruleHits = rules.map(() => 0);
  const cutHits = cuts.map(() => 0);
  const unmatched = new Map<string, number>();
  for (const unit of units) {
    const ruleIndex = matchRealmRule(unit, rules, () => interiorPointOf(unit));
    if (ruleIndex < 0) unmatched.set(unit.adm0, (unmatched.get(unit.adm0) ?? 0) + 1);
    else ruleHits[ruleIndex]!++;
    let rest = unit.polygons;
    for (const [cutIndex, cut] of cuts.entries()) {
      if (!cut.units.includes(unit.iso) || rest.length === 0) continue;
      const { inside, outside } = splitPolygonsByMask(rest, cut.mask);
      const taken = inside.filter((rings) => ringAreaKm2(rings[0]!, radiusKm) >= minPartKm2);
      if (taken.length === 0) continue;
      cutHits[cutIndex]!++;
      pieces.push({ key: cut.target ?? unclaimedKey, polygons: taken });
      rest = [...outside, ...inside.filter((rings) => !taken.includes(rings))];
    }
    const target = ruleIndex < 0 ? null : rules[ruleIndex]!.target;
    if (rest.length > 0) pieces.push({ key: target ?? unclaimedKey, polygons: rest });
  }
  return { pieces, ruleHits, cutHits, unmatched };
}
