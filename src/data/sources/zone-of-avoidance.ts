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
  // Deferred to true (plan says it should mirror milkyWay's bearsLabel:true,
  // labelLayer:'zoneOfAvoidance', detailLabel/shortLabel/plural) — flipping it
  // here cascades into total-Record compile errors in 4 files outside this
  // task's scope (LabelLayerId's + LabelBearingSourceType's every consumer:
  // focusRecession.ts, fadeIdToVisibilityKey.ts, labelHomeBySourceType.ts —
  // the last needs a setZoneOfAvoidanceLabelEnabled action creator that only
  // exists once the settings slice (Task 4) lands). Whichever task widens
  // those tables (Task 7/14) must also flip this row's label fields on.
  bearsLabel: false,
  // The curved "ZONE OF AVOIDANCE" lettering has no ring/halo marker —
  // markers are the structure-ring concept, which the band doesn't share.
  bearsMarker: false,
} as const satisfies ZoneOfAvoidanceSourceEntry;
