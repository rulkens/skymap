/**
 * OHM_RELATIONS_1690 — the OpenHistoricalMap relations (CC0) `REALM_CUTS_1690`
 * draws its Rhineland and Low Countries lines from, each alive on 1690-07-01 and
 * pinned to the version reviewed. `fetchOhm1690` reads them as they stood at
 * OHM_SNAPSHOT_1690 and refuses a version that differs from its pin: an edited
 * relation is re-reviewed, then re-pinned here.
 */

import type { OhmRelationPin } from '../@types/OhmRelationPin';

export const OHM_SNAPSHOT_1690 = '2026-11-07T14:38:11Z';

// prettier-ignore
export const OHM_RELATIONS_1690: readonly OhmRelationPin[] = [
  { id: 2695999, version: 27, name: 'Fürstentum Ostfriesland' },
  { id: 2696468, version: 31, name: 'Herzogtum Berg' },
  { id: 2744511, version: 23, name: 'Herzogtum Kleve' },
  { id: 2748665, version: 27, name: 'Hochstift Osnabrück' },
  { id: 2806958, version: 23, name: 'Herzogtum Westfalen' },
  { id: 2806963, version: 15, name: 'Hochstift Paderborn' },
  { id: 2807030, version: 43, name: 'Hochstift Münster' },
  { id: 2809747, version: 20, name: 'Grafschaft Mark' },
  { id: 2810096, version: 15, name: 'Herzogtum Limburg' },
  { id: 2815082, version: 20, name: 'Trois-Évêchés' },
  { id: 2815358, version: 28, name: 'Duché de Lorraine' },
  { id: 2815360, version: 15, name: 'Duché de Bar' },
  { id: 2815497, version: 21, name: 'Herzogtum Luxemburg' },
  { id: 2830738, version: 41, name: 'Kurfürstentum Mainz' },
  { id: 2831106, version: 40, name: 'Kurfürstentum Köln' },
  { id: 2831525, version: 11, name: 'Herzogtum Obergeldern' },
  { id: 2840402, version: 15, name: 'Fürstentum Ostfriesland' },
  { id: 2851710, version: 17, name: 'Grafschaft Oldenburg' },
  { id: 2896786, version: 10, name: 'Bremen-Verden' },
  { id: 2946204, version: 12, name: 'Principatus episcopalis Leodiensis' },
];
