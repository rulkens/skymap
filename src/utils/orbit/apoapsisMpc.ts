/**
 * Farthest point of an orbit from its focus, a·(1+e). Derived from the static
 * elements, NOT the conic CENTRES — a moon centre rides its moving parent, so a
 * centre-derived bound goes stale the moment the clock runs.
 */

import type { OrbitalElements } from '../../@types/scene/OrbitalElements';

export function apoapsisMpc(elements: OrbitalElements): number {
  return elements.semiMajorMpc * (1 + elements.eccentricity);
}
