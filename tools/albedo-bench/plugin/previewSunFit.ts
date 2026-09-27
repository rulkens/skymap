/**
 * previewSunFit — caps the sun-field fit to the box (spec addendum): scales
 * `strideKm` alone so the field's output-grid post count (arrows) stays
 * under `PREVIEW_MAX_ARROWS`. `windowKm`/`highPassKm`/`fillSigmaKm` stay at
 * the recipe's values — scaling them too feeds `growRegion`'s margin into a
 * cos(lat) blowup at wide spans, measured as an outright crash at 90°.
 */
import type { AlbedoRecipe } from '../../textures/AlbedoRecipe';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

const DEG_TO_RAD = Math.PI / 180;

// A "few hundred arrows" per the ruling; also caps fitSunField's own window
// count (proportional to the same box-area/stride² quantity), so this is
// the one knob that keeps both the fit's cost and the overlay's density sane.
export const PREVIEW_MAX_ARROWS = 300;

export type PreviewSunFit = {
  readonly sunFit: AlbedoRecipe['sunFit'];
  readonly coarsened: boolean;
};

function spanKm(box: LonLatBounds, kmPerDegAtEquator: number): { lat: number; lon: number } {
  const latCenter = (box.north + box.south) / 2;
  return {
    lat: Math.max(0, box.north - box.south) * kmPerDegAtEquator,
    lon: Math.max(0, box.east - box.west) * kmPerDegAtEquator * Math.cos(latCenter * DEG_TO_RAD),
  };
}

// fitSunField's output grid posts sit stride/2 apart in both directions
// (fillOutputGrid), each axis spanning its own km extent over that spacing
// plus its own closing post — mirrored here to estimate the post count a
// given stride would produce over `box`, without paying for the fit.
function arrowCount(lat: number, lon: number, strideKm: number): number {
  return ((2 * lon) / strideKm + 1) * ((2 * lat) / strideKm + 1);
}

export function previewSunFit(opts: {
  readonly sunFit: AlbedoRecipe['sunFit'];
  readonly box: LonLatBounds;
  readonly radiusM: number;
}): PreviewSunFit {
  const { sunFit, box, radiusM } = opts;
  const kmPerDegAtEquator = (radiusM / 1000) * DEG_TO_RAD;
  const { lat, lon } = spanKm(box, kmPerDegAtEquator);
  if (arrowCount(lat, lon, sunFit.strideKm) <= PREVIEW_MAX_ARROWS) {
    return { sunFit, coarsened: false };
  }

  // Solve for the stride factor that brings the count to exactly the cap,
  // rather than approximating via a plain sqrt(area ratio): the grid's own
  // "+1" closing post per axis makes count(f) = a·b/f² + (a+b)/f + 1 (a, b
  // the per-axis post counts at today's stride), which isn't a clean square
  // — a sqrt-of-area-ratio factor overshoots the cap once a, b are both
  // large, exactly where a wide preview needs the cap to hold hardest.
  const a = (2 * lon) / sunFit.strideKm;
  const b = (2 * lat) / sunFit.strideKm;
  const cap = PREVIEW_MAX_ARROWS;
  const factor = (a + b + Math.sqrt((a + b) ** 2 + 4 * (cap - 1) * a * b)) / (2 * (cap - 1));

  return {
    sunFit: { ...sunFit, strideKm: sunFit.strideKm * factor },
    coarsened: true,
  };
}
