/**
 * milkyWayInfo — the single static MilkyWayInfo record.
 *
 * The Milky Way has one instance, so its focusable info is a const here rather
 * than a catalog-row derivation (galaxies) or a parsed record (structures).
 * The `type` discriminant keeps it on the same table-dispatch path as those
 * other FocusableTarget arms.  World coords come straight from
 * `MILKY_WAY_CENTER_WORLD` (the galactic centre / Sgr A*), the single source of
 * truth for where the Milky Way sits in the engine's frame.
 */

import type { MilkyWayInfo } from '../../@types/engine/MilkyWayInfo';
import { MILKY_WAY_CENTER_WORLD } from './galacticCenter';

export const MILKY_WAY_INFO: MilkyWayInfo = {
  type: 'milkyWay',
  displayName: 'Milky Way',
  description: 'Our home galaxy — you are here',
  typeString: 'Barred spiral (SBbc)',
  distanceNote: '≈ 8 kpc to the galactic centre; we are inside it',
  x: MILKY_WAY_CENTER_WORLD[0],
  y: MILKY_WAY_CENTER_WORLD[1],
  z: MILKY_WAY_CENTER_WORLD[2],
};
