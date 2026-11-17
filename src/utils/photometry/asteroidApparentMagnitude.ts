/**
 * asteroidApparentMagnitude — V from the H,G system, the formula the dots' shader runs
 * (`asteroids/lib/apparentMagnitude.wesl`), so the card and the dot agree. r and Δ in AU; cosPhase is
 * cos α = dot(sun→ast, cam→ast) / (r·Δ), and tan(α/2) comes from it with no acos.
 */
import { HG_PHASE_LAW as L } from '../../data/asteroids/hgPhaseLaw';

export function asteroidApparentMagnitude(
  h: number,
  g: number,
  rAu: number,
  deltaAu: number,
  cosPhase: number,
): number {
  const c = Math.min(1, Math.max(L.cosPhaseMin, cosPhase));
  const halfTan = Math.max(L.halfTanFloor, Math.sqrt((1 - c) / (1 + c)));
  const phi1 = Math.exp(-L.a1 * halfTan ** L.b1);
  const phi2 = Math.exp(-L.a2 * halfTan ** L.b2);
  const phase = Math.max(L.phaseSumFloor, (1 - g) * phi1 + g * phi2);
  return h + 5 * Math.log10(rAu * deltaAu) - 2.5 * Math.log10(phase);
}
