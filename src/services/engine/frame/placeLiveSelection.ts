/**
 * placeLiveSelection — the frame's body snapshot with the moving selection placed in it: each
 * select/focus row whose driver is `placedEachFrame` is re-extracted at `simDays` and keyed under its
 * `poseId`, so the camera and every pass read the satellite where the clock has it. Hover never
 * places: a pointer sweep would extract every dot it crosses. Runs AFTER `deriveBodyStates`
 * returns, never inside it: the satellites row's `extractRow` reads `deriveBodyStates` for Earth.
 * Nothing to place hands `base` back itself, so the per-instant caches keyed on it still hit.
 */
import type { BodyState } from '../../../@types/scene/BodyState';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import { selectionDriver } from '../../../utils/selection/selectionDriver';
import { IDENTITY_MAT3 } from '../../../utils/math/identityMat3';
import type { SelectionRefBase } from '../../../@types/engine/selection/SelectionRefBase';
import type { SelectionRowBase } from '../../../@types/engine/selection/SelectionRowBase';
import type { PlacedRow } from '../../../@types/engine/selection/PlacedRow';

export function placeLiveSelection(
  base: ReadonlyMap<PositionedId, BodyState>,
  slots: readonly {
    readonly ref: SelectionRefBase | null;
    readonly row: SelectionRowBase | null;
  }[],
  kindRows: readonly SelectionKindRow[],
  simDays: number,
): ReadonlyMap<PositionedId, BodyState> {
  let placed: Map<PositionedId, BodyState> | null = null;
  const extractedRefs = new Set<SelectionRefBase>();
  for (const { ref, row } of slots) {
    if (ref === null || extractedRefs.has(ref) || selectionDriver(row)?.placedEachFrame !== true)
      continue;
    extractedRefs.add(ref);
    const extracted = kindRows.find((kind) => kind.type === ref.type)?.extractRow(ref, simDays);
    const poseId = selectionDriver(extracted ?? null)?.poseId;
    // A row whose driver is placed each frame is a placed row by its kind's contract.
    if (extracted == null || poseId == null) continue;
    placed ??= new Map(base);
    const [x, y, z] = (extracted as PlacedRow).positionMpc;
    // A transient id has no rotation row, so it gets what `orientationForBody` gives one.
    placed.set(poseId, { positionMpc: [x, y, z], orientation: [...IDENTITY_MAT3] as Mat3 });
  }
  return placed ?? base;
}
