import { Source } from '../../../data/source';
import { packSelection, PICK_SENTINEL_OFFSET } from '../../../data/selectionEncoding';
import { deriveBodyStates } from '../../../services/engine/frame/deriveBodyStates';
import { schwarzschildRadiusM } from '../../../utils/physics/schwarzschildRadiusM';
import { BLACK_HOLES } from '../data/blackHoles';
import { BLACK_HOLE_SOURCE_ROWS } from '../sources/blackHoleSourceRows';
import { blackHoleAnchorId } from './blackHoleAnchorId';
import { BLACK_HOLE_FOCUS_PREFIX } from './blackHoleFocusPrefix';
import { encodeBlackHoleFocusId } from './encodeBlackHoleFocusId';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';

const ENTRIES = BLACK_HOLE_SOURCE_ROWS.map(([, entry]) => entry);

export function blackHoleSelectionRow(): SelectionKindRow<
  Extract<SelectionRef, { type: 'blackHole' }>
> {
  return {
    type: 'blackHole',
    pickSources: [Source.SgrAStar],
    resolvePick: (_entry, pick) => {
      const row = BLACK_HOLES[pick.localIdx];
      return row ? { type: 'blackHole', id: row.id } : null;
    },
    encodePick: (ref) => {
      const index = BLACK_HOLES.findIndex((hole) => hole.id === ref.id);
      return index < 0 ? null : packSelection(Source.SgrAStar, index + PICK_SENTINEL_OFFSET);
    },
    extractRow: (ref, simDays) => {
      const row = BLACK_HOLES.find((hole) => hole.id === ref.id);
      const entry = ENTRIES.find((e) => e.id === ref.id);
      if (!row || !entry) return null;
      const anchorId = blackHoleAnchorId(row);
      const p = deriveBodyStates(simDays).get(anchorId)!.positionMpc;
      const rS = schwarzschildRadiusM(row.massSolar);
      return {
        type: 'blackHole',
        id: row.id,
        label: entry.label,
        detailLabel: entry.detailLabel,
        massSolar: row.massSolar,
        schwarzschildRadiusM: rS,
        positionMpc: [p[0], p[1], p[2]],
        driver: {
          poseId: anchorId,
          boundingRadiusM: rS,
          footprintRadiusM: rS,
          groundRadiusM: rS,
          standoffRadii: row.standoffRadii,
          focusDistanceRadii: row.focusDistanceRadii,
        },
      };
    },
    focusId: {
      claims: (id) => id.startsWith(BLACK_HOLE_FOCUS_PREFIX),
      decode: (id) => {
        const row = BLACK_HOLES.find((hole) => encodeBlackHoleFocusId(hole.id) === id);
        return row ? { type: 'blackHole', id: row.id } : null;
      },
      encode: (ref) => encodeBlackHoleFocusId(ref.id),
    },
  };
}
