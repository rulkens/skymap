import type { SurfaceTileManifest } from '../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifest';
import type { SurfaceTileManifestBand } from '../../../../src/layers/body/surfaceTiles/format/@types/SurfaceTileManifestBand';
import { mergeSurfaceTileManifest } from '../../../utils/textures/mergeSurfaceTileManifest';
import { horizonLevelsOfBand } from './horizonLevelsOfBand';

/**
 * horizonManifest — `manifest` once the horizon of `bakedBands` (rows of it, with heights) is
 * written: each gets a row of its own at the levels its horizon tiles exist at, and
 * loses any `horizon` entry of its own, so the planner never requests horizon at height's levels.
 */
export function horizonManifest(
  manifest: SurfaceTileManifest,
  bakedBands: readonly SurfaceTileManifestBand[],
): SurfaceTileManifest {
  const stripped = manifest.bands.map((band) => {
    if (!bakedBands.includes(band)) return band;
    const { horizon: _horizon, ...builtFrom } = band.builtFrom;
    return { ...band, builtFrom };
  });
  const horizonBands = bakedBands.map((band) => ({
    bounds: band.bounds,
    ...horizonLevelsOfBand(band),
    builtFrom: {
      horizon: {
        sourceId: 'derived:height',
        attribution: band.builtFrom.height?.attribution ?? '',
        vintage: band.builtFrom.height?.vintage ?? '',
      },
    },
  }));
  return mergeSurfaceTileManifest(
    { ...manifest, bands: stripped },
    { ...manifest, bands: horizonBands },
  );
}
