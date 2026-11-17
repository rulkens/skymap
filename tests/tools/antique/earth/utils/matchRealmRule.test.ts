/**
 * The 1690 rules are an ordered list where a specific unit must win over its
 * country (Wales before Britain, Liège's units before Belgium) and a centroid
 * rule must only claim units of its own country.
 */

import { describe, it, expect } from 'vitest';

import type { RealmRule1690 } from '../../../../../tools/antique/earth/@types/RealmRule1690';
import { matchRealmRule } from '../../../../../tools/antique/earth/utils/matchRealmRule';
import { lonLatBoxRing } from '../../../../../tools/antique/earth/utils/lonLatBoxRing';

const RULES: readonly RealmRule1690[] = [
  { match: 'geonunit', codes: ['Wales'], target: 'wallia' },
  { match: 'unit', codes: ['BE-WLG'], target: 'leodium' },
  { match: 'centroid', adm0: 'MDA', ring: lonLatBoxRing(27, 45, 30.2, 46.45), target: 'bessarabia' },
  { match: 'adm0', codes: ['GBR'], target: 'anglia' },
  { match: 'adm0', codes: ['BEL', 'MDA'], target: 'belgiumRegium' },
];
const nowhere = () => [0, 0] as const;

describe('matchRealmRule', () => {
  it('lets the first matching rule win, specific units before their country', () => {
    expect(matchRealmRule({ iso: 'GB-CRF', adm0: 'GBR', geonunit: 'Wales' }, RULES, nowhere)).toBe(0);
    expect(matchRealmRule({ iso: 'GB-KEN', adm0: 'GBR', geonunit: 'England' }, RULES, nowhere)).toBe(3);
    expect(matchRealmRule({ iso: 'BE-WLG', adm0: 'BEL', geonunit: 'Belgium' }, RULES, nowhere)).toBe(1);
    expect(matchRealmRule({ iso: 'BE-WHT', adm0: 'BEL', geonunit: 'Belgium' }, RULES, nowhere)).toBe(4);
  });

  it('tests a centroid rule only against units of its own country', () => {
    const south = () => [28.5, 45.8] as const;
    expect(matchRealmRule({ iso: 'MD-CA', adm0: 'MDA', geonunit: '' }, RULES, south)).toBe(2);
    expect(matchRealmRule({ iso: 'MD-CU', adm0: 'MDA', geonunit: '' }, RULES, () => [28.8, 47.0])).toBe(4);
    expect(matchRealmRule({ iso: 'UA-51', adm0: 'UKR', geonunit: '' }, RULES, south)).toBe(-1);
  });
});
