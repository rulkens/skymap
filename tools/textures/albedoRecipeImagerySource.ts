/**
 * albedoRecipeImagerySource — the decorator wrapping a photographic source
 * with the de-shade/knee/ice/grade pipeline (design §9). Slopes and `g` are
 * both sampled from global lon/lat lattices, not rebuilt per box, so two
 * adjacent boxes agree exactly at their shared edge. The caller owns
 * `field` (the bake fits the globe once; the bench fits its own view) — a
 * box outside it throws rather than silently clamping to a mis-sized fit.
 */
import type { AlbedoApply } from './AlbedoApply';
import type { HeightSource } from './HeightSource';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';
import { applyAlbedoRecipe } from '../utils/textures/applyAlbedoRecipe';
import { sampleSlope } from '../utils/textures/sampleSlope';
import { sampleSunField } from '../utils/textures/sampleSunField';
import { readSlopeLattice } from './readSlopeLattice';
import type { SunField } from './SunField';
import type { SurfaceImagerySource } from './SurfaceImagerySource';

// R-P3: inclusive with a small tolerance, so a box edge that lands a ULP
// outside `field.bounds` — the same edge, computed a different way by the
// caller — doesn't throw over a rounding artifact.
const BOUNDS_TOLERANCE_DEG = 1e-9;

function insideBounds(box: LonLatBounds, bounds: LonLatBounds): boolean {
  return (
    box.west >= bounds.west - BOUNDS_TOLERANCE_DEG &&
    box.east <= bounds.east + BOUNDS_TOLERANCE_DEG &&
    box.south >= bounds.south - BOUNDS_TOLERANCE_DEG &&
    box.north <= bounds.north + BOUNDS_TOLERANCE_DEG
  );
}

export function albedoRecipeImagerySource(
  primary: SurfaceImagerySource,
  height: HeightSource,
  field: SunField,
  apply: AlbedoApply,
): SurfaceImagerySource {
  return {
    id: primary.id,
    attribution: primary.attribution,
    maxLevel: primary.maxLevel,
    coverage: primary.coverage,
    provenance: primary.provenance,

    async readBox(box, widthPx, heightPx) {
      const raster = await primary.readBox(box, widthPx, heightPx);
      if (raster === null) return null;
      if (!insideBounds(box, field.bounds)) {
        throw new Error(
          `albedoRecipeImagerySource: box ${JSON.stringify(box)} is outside field.bounds ${JSON.stringify(field.bounds)}`,
        );
      }

      const lattice = await readSlopeLattice(height, box, field.radiusM);
      return applyAlbedoRecipe(
        raster,
        widthPx,
        heightPx,
        (px, py) => {
          const lat = box.north - ((py + 0.5) / heightPx) * (box.north - box.south);
          const lon = box.west + ((px + 0.5) / widthPx) * (box.east - box.west);
          const [sx, sy] = sampleSlope(lattice, lon, lat);
          const [gx, gy] = sampleSunField(field, lon, lat);
          return { sx, sy, gx, gy, latDeg: lat };
        },
        apply,
      );
    },
  };
}
