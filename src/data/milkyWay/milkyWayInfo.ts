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
  description:
    'Our home galaxy is a barred spiral: a flat disc of gas, dust and a few hundred billion stars, wound into spiral arms around a central bar. The Sun sits roughly halfway out, in a minor arm called the Orion Spur between two major ones, and circles the centre about once every 220 million years. From inside, we see the disc edge-on as the pale band across the night sky that gave the galaxy its name. At its very centre lies Sagittarius A*, a black hole of about four million solar masses.',
  typeString: 'Barred spiral (SBbc)',
  x: MILKY_WAY_CENTER_WORLD[0],
  y: MILKY_WAY_CENTER_WORLD[1],
  z: MILKY_WAY_CENTER_WORLD[2],
};
