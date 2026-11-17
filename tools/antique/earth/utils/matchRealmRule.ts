/**
 * matchRealmRule — the first of `rules` an admin-1 unit matches, by index, or
 * -1 when none does (the unit stays unclaimed and the bake reports it). A
 * centroid rule tests the unit's interior point, so it is only needed, and
 * only asked for, when such a rule names the unit's country.
 */

import type { AdminUnit } from '../@types/AdminUnit';
import type { RealmRule1690 } from '../@types/RealmRule1690';
import { pointInRing } from './pointInRing';

export function matchRealmRule(
  unit: Pick<AdminUnit, 'iso' | 'adm0' | 'geonunit'>,
  rules: readonly RealmRule1690[],
  interiorPoint: () => readonly [number, number],
): number {
  return rules.findIndex((rule) => {
    switch (rule.match) {
      case 'adm0':
        return rule.codes.includes(unit.adm0);
      case 'unit':
        return rule.codes.includes(unit.iso);
      case 'geonunit':
        return rule.codes.includes(unit.geonunit);
      case 'centroid':
        return rule.adm0 === unit.adm0 && pointInRing(interiorPoint(), rule.ring);
    }
  });
}
