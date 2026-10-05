/**
 * slabRowActive — whether a banded `SlabRow` exists this frame. The row's
 * `activeBand` is the ONE gate on whatever consumes it (spec §2.5), so this
 * must reproduce `skyCaptureBandAlpha(key) > 0` exactly for a row holding the
 * same band object as its capture.
 *
 * An unresolved anchor reads as Infinity, not 0 — the near-field bands are
 * full at their small-distance edge, so 0 would switch absent content ON
 * (the same rule `regionRelativeDistanceMpc` states).
 */

import type { BodyState } from '../../@types/scene/BodyState';
import type { SlabRow } from '../../@types/engine/frame/SlabRow';
import type { Vec3 } from '../../@types/math/Vec3';
import { distanceMpc } from '../math/distanceMpc';
import { fadeBand } from '../math/fadeBand';

export function slabRowActive(
  row: SlabRow,
  camPosMpc: Readonly<Vec3>,
  states: ReadonlyMap<string, BodyState>,
): boolean {
  if (row.activeBand === undefined) return true;
  const anchor = states.get(row.anchorId);
  const distance = anchor === undefined ? Infinity : distanceMpc(camPosMpc, anchor.positionMpc);
  return fadeBand(row.activeBand, distance) > 0;
}
