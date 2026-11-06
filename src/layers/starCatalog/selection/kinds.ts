import { BODY_FOCUS } from '../../../data/selection/bodyFocus';
import { SEEDED_STAR_CATALOGS_BY_SOURCE } from '../../../data/bodies/seededStarCatalogsBySource';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { starDetail } from './utils/starDetail';
import type { SelectionKindFacts } from '../../../@types/engine/layer/SelectionKindFacts';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { FocusableTarget } from '../../../@types/engine/FocusableTarget';

export const starCatalogSelectionKinds: readonly SelectionKindFacts<
  Extract<SelectionRef, { type: 'starCatalog' }>,
  Extract<SelectionRow, { type: 'starCatalog' }>,
  Extract<FocusableTarget, { type: 'starCatalog' }>
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
