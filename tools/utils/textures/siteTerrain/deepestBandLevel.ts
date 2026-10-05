import type { SurfaceTileManifest } from '../../../../src/@types/scene/SurfaceTileManifest';

/** deepestBandLevel — the deepest band covering `(latDeg, lonDeg)`. Several
 *  bands can overlap (a regional site window nested inside the whole-globe
 *  band), and the regional one is always the tighter, deeper-baked read. */
export function deepestBandLevel(
  manifest: SurfaceTileManifest,
  latDeg: number,
  lonDeg: number,
): number {
  const lonW = ((lonDeg + 540) % 360) - 180;
  const hits = manifest.bands.filter(
    (band) =>
      lonW >= band.bounds.west &&
      lonW <= band.bounds.east &&
      latDeg >= band.bounds.south &&
      latDeg <= band.bounds.north,
  );
  if (hits.length === 0) {
    throw new Error(`deepestBandLevel: no band covers (${latDeg}, ${lonDeg})`);
  }
  return Math.max(...hits.map((band) => band.max));
}
