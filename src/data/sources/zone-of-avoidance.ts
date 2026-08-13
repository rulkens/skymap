import type { ZoneOfAvoidanceSourceEntry } from '../../@types/data/zoneOfAvoidance/ZoneOfAvoidanceSourceEntry';
import { Source } from '../source';

export const ZONE_OF_AVOIDANCE_ENTRY = {
  type: 'zoneOfAvoidance',
  code: Source.ZoneOfAvoidance,
  id: 'zoneOfAvoidance',
  label: 'Zone of Avoidance',
  // Radially-extruded wedge around the observer; allSky:true matches the
  // other non-catalog overlays (the coverage-mask logic only consults this
  // for galaxy-catalog patches).
  allSky: true,
  // On by default — not what actually seeds the settings default (that's
  // DEFAULT_ZONE_OF_AVOIDANCE_ENABLED, a plain literal); set true here for
  // internal consistency with the row it mirrors.
  visible: true,
  // The curved "Zone of Avoidance" lettering rides the band's own toggle
  // and fade layer (zoneOfAvoidanceLayer.ts), not the label subsystem — so
  // this row does not register as label-bearing.
  bearsLabel: false,
  // The curved "Zone of Avoidance" lettering has no ring/halo marker —
  // markers are the structure-ring concept, which the band doesn't share.
  bearsMarker: false,
} as const satisfies ZoneOfAvoidanceSourceEntry;
