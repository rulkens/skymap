/**
 * Does a focus keep this rung? True when `focusId` IS `rungId` or reaches it by
 * walking `bodyHostId` (the chain's only reader) — a rover focus keeps its
 * planet's arm (spec §4.8). No focus constrains no rung, hence null ⇒ true.
 */

import type { BodyId } from '../../@types/data/body/BodyId';
import { bodyHostId } from '../../data/bodies/positionDrivers';

export function focusInSubtree(focusId: BodyId | null, rungId: BodyId): boolean {
  if (focusId === null) return true;
  // The chain is seed data, so a bad seed would otherwise hang the frame loop.
  const seen = new Set<string>();
  let id: string | null = focusId;
  while (id !== null && !seen.has(id)) {
    if (id === rungId) return true;
    seen.add(id);
    id = bodyHostId(id);
  }
  return false;
}
