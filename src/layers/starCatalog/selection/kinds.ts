import { BODY_FOCUS } from '../../../data/selection/bodyFocus';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../seededStars/data/seededStarCatalogsBySource';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { starDetail } from './utils/starDetail';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { StarCatalogRef } from './@types/StarCatalogRef';
import type { StarCatalogSelectionRow } from './@types/StarCatalogSelectionRow';
import type { StarCatalogTarget } from './@types/StarCatalogTarget';

export const starCatalogSelectionKinds: readonly SelectionKindFacts<
  StarCatalogRef,
  StarCatalogSelectionRow,
  StarCatalogTarget
>[] = [
  {
    type: 'starCatalog',
    focus: BODY_FOCUS,
    // Only seeded stars carry captions; a Gaia survey star is InfoCard text only.
    mayHaveLabel: (ref) => SEEDED_STAR_CATALOGS_BY_SOURCE.has(ref.source),
    // One target serves every star; its `detail` follows what the star HAS, not its catalog.
    toFocusable: (row) => {
      const [x, y, z] = row.positionMpc;
      const distancePc = Math.hypot(x, y, z) / SCALE_UNITS.PC_TO_MPC;
      return {
        type: 'starCatalog',
        ref: { type: 'starCatalog', source: row.source, index: row.index },
        source: row.source,
        index: row.index,
        id: row.id,
        displayName: row.label,
        x,
        y,
        z,
        distancePc,
        detail: starDetail(row, distancePc),
      };
    },
    displayName: (target) => target.displayName,
  },
];
