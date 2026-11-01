/**
 * Does a focus keep this rung? True when `focusId` IS `rungId` or reaches it up
 * the SURFACE-FIXED chain — a rover keeps its planet's arm (spec §4.8). No focus
 * constrains no rung, hence null ⇒ true.
 */

import type { SceneBodyId } from '../../@types/scene/SceneBodyId';
import { surfaceFixedChain } from './surfaceFixedChain';
import type { PositionedId } from '../../@types/scene/PositionedId';

export function focusInSubtree(focusId: PositionedId | null, rungId: SceneBodyId): boolean {
  return focusId === null || surfaceFixedChain(focusId).includes(rungId);
}
