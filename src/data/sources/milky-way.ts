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
  bearsLabel: true,
  // The "You are here" label has a stem line but no ring/halo marker —
  // markers are the structure-ring concept, which the disk overlay doesn't share.
  bearsMarker: false,
  labelLayer: 'milkyWay',
  detailLabel: 'Milky Way',
  shortLabel: 'Milky Way',
  plural: 'Milky Way',
} as const satisfies MilkyWaySourceEntry;
