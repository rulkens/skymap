/**
 * Does a focus keep this arm? True when `focusId` IS `armId` or reaches it up
 * the SURFACE-FIXED chain — a rover keeps its planet's arm (spec §4.8). No focus
 * constrains no arm, hence null ⇒ true.
 */

import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import { surfaceFixedChain } from './surfaceFixedChain';
import type { PositionedId } from '../../@types/scene/PositionedId';

export function focusInSubtree(focusId: PositionedId | null, armId: SceneBodyId): boolean {
  return focusId === null || surfaceFixedChain(focusId).includes(armId);
}
