/**
 * blackHoleSelectionRow — the `blackHole` selection kind. A hole poses from its
 * PLACE (`anchorId`), so the camera targets the Galactic Centre whatever sits
 * there, and every radius the driver carries is r_s: arrival (the kind's
 * `focus.arrivalSize`) and the descent floor (`standoffRadii`) are measured in
 * it. The footprint stays r_s rather than the lens's extent, or arrival would
 * scale with the lens (P1).
 */

import { packSelection, PICK_SENTINEL_OFFSET } from '../../../../data/selectionEncoding';
import { deriveBodyStates } from '../../../../services/engine/frame/deriveBodyStates';
import { schwarzschildRadiusM } from '../../../../utils/physics/schwarzschildRadiusM';
import { footprintRadiusMpc } from '../../../../utils/selection/footprintRadiusMpc';
import { BLACK_HOLES } from '../data/blackHoles';
import { BLACK_HOLE_SOURCE_ROWS } from '../../sources/blackHoleSourceRows';
import { blackHoleAnchorId } from './blackHoleAnchorId';
import { BLACK_HOLE_FOCUS_PREFIX } from './blackHoleFocusPrefix';
import { encodeBlackHoleFocusId } from './encodeBlackHoleFocusId';
import type { SelectionRef } from '../../../../@types/engine/SelectionRef';
import type { SelectionKindRow } from '../../../../@types/engine/layer/SelectionKindRow';

const ENTRIES = BLACK_HOLE_SOURCE_ROWS.map(([, entry]) => entry);

export function blackHoleSelectionRow(
  pickCode: number,
): SelectionKindRow<Extract<SelectionRef, { type: 'blackHole' }>> {
  return {
    type: 'blackHole',
    pickSources: [pickCode],
    resolvePick: (pick) => {
      const row = BLACK_HOLES[pick.localIdx];
      return row ? { type: 'blackHole', id: row.id } : null;
    },
    encodePick: (ref) => {
      const index = BLACK_HOLES.findIndex((hole) => hole.id === ref.id);
      return index < 0 ? null : packSelection(pickCode, index + PICK_SENTINEL_OFFSET);
    },
    extractRow: (ref, simDays) => {
      const row = BLACK_HOLES.find((hole) => hole.id === ref.id);
      const entry = ENTRIES.find((e) => e.id === ref.id);
      if (!row || !entry) return null;
      const anchorId = blackHoleAnchorId(row);
      const p = deriveBodyStates(simDays).get(anchorId)!.positionMpc;
      const rS = schwarzschildRadiusM(row.massSolar);
      const driver = {
        poseId: anchorId,
        boundingRadiusM: rS,
        footprintRadiusM: rS,
        groundRadiusM: rS,
        standoffRadii: row.standoffRadii,
      };
      return {
        type: 'blackHole',
        id: row.id,
        label: entry.label,
        detailLabel: entry.detailLabel,
        massSolar: row.massSolar,
        schwarzschildRadiusM: rS,
        positionMpc: [p[0], p[1], p[2]],
        radiusMpc: footprintRadiusMpc(driver),
        driver,
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
