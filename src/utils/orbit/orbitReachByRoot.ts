/**
 * Each root anchor's orbital reach FROM THAT ANCHOR, over ALL clock times — a
 * TIME-INVARIANT outer envelope. A root is where a focus chain ends: the Sun,
 * the Galactic Centre, a star with planets.
 *
 * Per root, not one scene-wide maximum, because a reach is only ever subtracted
 * from a camera distance measured against the SAME anchor. Fold a Galactic Centre
 * orbit into a single maximum and the solar-system trails inherit ITS envelope, so
 * the orbit-trail cull stops firing for cameras nowhere near it.
 *
 * The tables are parameters so the far-anchored case is testable before such an
 * orbit is seeded.
 */

import type { AnchorBody } from '../../@types/scene/AnchorBody';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import type { PositionedId } from '../../@types/scene/PositionedId';
import { focusResolveOrder } from '../scene/focusResolveOrder';
import { apoapsisMpc } from './apoapsisMpc';

export function orbitReachByRoot(
  anchors: readonly AnchorBody[],
  elements: readonly OrbitalElements[],
): ReadonlyMap<PositionedId, number> {
  const reachMpc = new Map<string, number>();
  const rootOf = new Map<string, PositionedId>();
  // An anchor has no orbit of its own to extend the envelope, and is its own root.
  for (const anchor of anchors) {
    reachMpc.set(anchor.id, 0);
    rootOf.set(anchor.id, anchor.id);
  }
  const byRoot = new Map<PositionedId, number>();
  for (const el of focusResolveOrder(anchors, elements)) {
    const reach = apoapsisMpc(el) + reachMpc.get(el.focusId)!;
    const root = rootOf.get(el.focusId)!;
    reachMpc.set(el.id, reach);
    rootOf.set(el.id, root);
    byRoot.set(root, Math.max(byRoot.get(root) ?? 0, reach));
  }
  return byRoot;
}
