/**
 * Each region's orbital reach FROM ITS OWN ANCHOR, over ALL clock times — a
 * TIME-INVARIANT outer envelope.
 *
 * Per region, not one scene-wide maximum, because a reach is only ever subtracted
 * from a camera distance measured against the SAME anchor. The two collapse into
 * one number only while every orbit hangs off the origin-anchored Sun; fold a
 * Galactic Centre orbit into a single maximum and the solar-system trails inherit
 * ITS envelope, so the orbit-trail cull stops firing for cameras nowhere near it.
 *
 * The tables are parameters so the far-anchored case is testable before such an
 * orbit is seeded; `focusResolveOrder` covers a focus chain of any depth.
 */

import type { AnchorBody } from '../../@types/scene/AnchorBody';
import type { BodyRegion } from '../../@types/scene/BodyRegion';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';
import { focusResolveOrder } from '../scene/focusResolveOrder';
import { apoapsisMpc } from './apoapsisMpc';

export function orbitReachByRegion(
  anchors: readonly AnchorBody[],
  elements: readonly OrbitalElements[],
  regionOf: (bodyId: string) => BodyRegion | null,
): ReadonlyMap<BodyRegion, number> {
  const reachMpc = new Map<string, number>();
  // An anchor has no orbit of its own to extend the envelope.
  for (const anchor of anchors) reachMpc.set(anchor.id, 0);
  for (const el of focusResolveOrder(anchors, elements)) {
    reachMpc.set(el.id, apoapsisMpc(el) + reachMpc.get(el.focusId)!);
  }
  const byRegion = new Map<BodyRegion, number>();
  for (const el of elements) {
    const region = regionOf(el.id);
    if (region === null) continue;
    byRegion.set(region, Math.max(byRegion.get(region) ?? 0, reachMpc.get(el.id)!));
  }
  return byRegion;
}
