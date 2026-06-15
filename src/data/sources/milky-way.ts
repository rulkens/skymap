import type { MilkyWaySourceEntry } from '../../@types/data/milkyWay/MilkyWaySourceEntry';
import { Source } from '../source';

export const MILKY_WAY_ENTRY = {
  type: 'milkyWay',
  code: Source.MilkyWay,
  id: 'milkyWay',
  label: 'Milky Way',
  // The galactic disk is centred on the observer; allSky:true matches the
  // other non-catalog overlays (the coverage-mask logic only consults this
  // for galaxy-catalog patches).
  allSky: true,
  // On by default — the galactic disk is part of the baseline scene.
  visible: true,
  bearsLabel: false,
  bearsMarker: false,
} as const satisfies MilkyWaySourceEntry;
