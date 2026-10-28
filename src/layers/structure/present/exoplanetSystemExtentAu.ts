import type { ExoplanetOrbitSystem } from '../@types/ExoplanetOrbitSystem';

/** Radius of the orbit diagram in au: its outermost orbit or habitable-zone edge. */
export function exoplanetSystemExtentAu(system: ExoplanetOrbitSystem): number {
  return Math.max(
    ...system.planets.map((p) => p.semiMajorAxisAu),
    system.habitableZoneAu?.[1] ?? 0,
  );
}
