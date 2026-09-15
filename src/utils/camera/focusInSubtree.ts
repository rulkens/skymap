/**
 * Does a focus keep this rung? True when `focusId` IS `rungId` or reaches it up
 * the SURFACE-FIXED chain — a rover keeps its planet's arm (spec §4.8). An
 * orbiting focus stops the walk: it leaves a body-fixed arm behind rather than
 * riding it. No focus constrains no rung, hence null ⇒ true.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import { surfaceFixedChain } from './surfaceFixedChain';

export function focusInSubtree(focusId: BodyId | null, rungId: BodyId): boolean {
  return focusId === null || surfaceFixedChain(focusId).includes(rungId);
}
