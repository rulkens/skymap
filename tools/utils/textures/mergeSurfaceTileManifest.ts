import type { SurfaceTileManifest } from '../../../src/@types/scene/SurfaceTileManifest';
import type { SurfaceTileManifestBand } from '../../../src/@types/scene/SurfaceTileManifestBand';

function bandsMatch(a: SurfaceTileManifestBand, b: SurfaceTileManifestBand): boolean {
  return (
    a.min === b.min &&
    a.max === b.max &&
    a.bounds.west === b.bounds.west &&
    a.bounds.east === b.bounds.east &&
    a.bounds.south === b.bounds.south &&
    a.bounds.north === b.bounds.north
  );
}

/**
 * mergeSurfaceTileManifest — pure. Bands match on `(bounds, min, max)`
 * equality. A matched band's `builtFrom` is the prior's with this run's
 * products overwritten (a `--product albedo` run must not erase the height
 * provenance a fuller prior run recorded); unmatched prior bands are kept, in
 * their prior order, with this run's new bands appended after. A prior with
 * a different `prefix` is ignored entirely — a version bump is a fresh
 * pyramid, not a merge target.
 */
export function mergeSurfaceTileManifest(
  prior: SurfaceTileManifest | null,
  run: SurfaceTileManifest,
): SurfaceTileManifest {
  if (prior === null || prior.prefix !== run.prefix) return run;

  const bands: SurfaceTileManifestBand[] = prior.bands.map((priorBand) => {
    const runBand = run.bands.find((band) => bandsMatch(band, priorBand));
    if (runBand === undefined) return priorBand;
    return { ...priorBand, builtFrom: { ...priorBand.builtFrom, ...runBand.builtFrom } };
  });
  for (const runBand of run.bands) {
    if (!prior.bands.some((band) => bandsMatch(band, runBand))) bands.push(runBand);
  }

  return { ...run, bands };
}
