/**
 * placeLiveSelection — the frame's body snapshot with the moving selection placed in it: each
 * select/focus row whose driver `followsSimClock` is re-extracted at `simDays` and keyed under its
 * `poseId`, so the camera and every pass read the satellite where the clock has it. Hover never
 * places: a pointer sweep would extract every dot it crosses. Runs AFTER `deriveBodyStates`
 * returns, never inside it: the satellites row's `extractRow` reads `deriveBodyStates` for Earth.
 * Nothing to place hands `base` back itself, so the per-instant caches keyed on it still hit.
 */
import type { BodyState } from '../../../@types/scene/BodyState';
import type { Mat3 } from '../../../@types/math/Mat3';
import type { PositionedId } from '../../../@types/scene/PositionedId';
import type { SelectionRef } from '../../../@types/engine/SelectionRef';
import type { SelectionRow } from '../../../@types/engine/SelectionRow';
import type { SelectionKindRow } from '../../../@types/engine/layer/SelectionKindRow';
import { selectionDriver } from '../../../utils/selection/selectionDriver';
import { IDENTITY_MAT3 } from '../../../utils/math/identityMat3';

export function placeLiveSelection(
  base: ReadonlyMap<PositionedId, BodyState>,
  slots: readonly { readonly ref: SelectionRef | null; readonly row: SelectionRow | null }[],
  kindRows: readonly SelectionKindRow[],
  simDays: number,
): ReadonlyMap<PositionedId, BodyState> {
  let placed: Map<PositionedId, BodyState> | null = null;
  const extractedRefs = new Set<SelectionRef>();
  for (const { ref, row } of slots) {
    if (ref === null || extractedRefs.has(ref) || selectionDriver(row)?.followsSimClock !== true)
      continue;
    extractedRefs.add(ref);
    const extracted = kindRows.find((kind) => kind.type === ref.type)?.extractRow(ref, simDays);
    const poseId = selectionDriver(extracted ?? null)?.poseId;
    if (extracted == null || !('positionMpc' in extracted) || poseId == null) continue;
    placed ??= new Map(base);
    const [x, y, z] = extracted.positionMpc;
    // A transient id has no rotation row, so it gets what `orientationForBody` gives one.
    placed.set(poseId, { positionMpc: [x, y, z], orientation: [...IDENTITY_MAT3] as Mat3 });
  }
  return placed ?? base;
}
