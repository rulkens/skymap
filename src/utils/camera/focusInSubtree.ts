/**
 * Does a focus keep this rung? True when `focusId` IS `rungId` or reaches it up
 * the SURFACE-FIXED chain — a rover keeps its planet's arm (spec §4.8). No focus
 * constrains no rung, hence null ⇒ true.
 */

import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import { surfaceFixedChain } from './surfaceFixedChain';
import type { PlaceId } from '../../@types/scene/PlaceId';

export function focusInSubtree(
  focusId: SceneBodyId | PlaceId | null,
  rungId: SceneBodyId,
): boolean {
  return focusId === null || surfaceFixedChain(focusId).includes(rungId);
}
