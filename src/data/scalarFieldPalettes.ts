/**
 * Scalar-field palette table.  Each palette is a 256-entry RGBA8 LUT
 * sampled on the GPU as a 1D texture; the alpha channel doubles as the
 * opacity ramp so voids (low values) are transparent and density peaks
 * (high values) are opaque.
 *
 * Why bake the alpha into the LUT instead of computing it shader-side
 * from the value: the perceptual mapping varies per palette (yellow-
 * green wants a steeper opacity ramp than blue-purple to compensate for
 * the higher luminance), and folding it into the LUT lets us tune both
 * colour AND opacity in a single artist-facing data structure.  A
 * separate opacity LUT would double the bind-group complexity for no
 * functional gain.
 *
 * Why these four palettes:
 *   - viridis  / magma         : generic perceptual gradients (matplotlib
 *                                 colormaps).  Useful fallbacks for new
 *                                 datasets before someone picks a brand
 *                                 colour.
 *   - blue-purple              : CF-4 default; matches the Pomarède/Tully
 *                                 publication aesthetic for cosmography.
 *   - yellow-green             : MCPM default; deliberately distinct from
 *                                 blue-purple so the two layers read as
 *                                 separate overlays when both are on.
 *
 * Adding a new palette: extend the union type in ScalarCube.d.ts, add a
 * builder branch here, regenerate any binaries that should reference it.
 * The renderer reads `paletteId` from the cube header — no other touch
 * points.
 */

import type { ScalarFieldPaletteId } from '../@types/ScalarCube';

export const PALETTE_LUT_SIZE = 256;

export function buildPaletteLut(id: ScalarFieldPaletteId): Uint8Array {
  switch (id) {
    case 'viridis':
      return rampLut([
        [0.0, 68, 1, 84],
        [0.25, 59, 82, 139],
        [0.5, 33, 144, 141],
        [0.75, 94, 201, 98],
        [1.0, 253, 231, 37],
      ]);
    case 'magma':
      return rampLut([
        [0.0, 0, 0, 4],
        [0.25, 80, 18, 123],
        [0.5, 182, 54, 121],
        [0.75, 252, 137, 97],
        [1.0, 252, 253, 191],
      ]);
    case 'blue-purple':
      return rampLut([
        [0.0, 5, 5, 30],
        [0.4, 60, 30, 150],
        [0.7, 140, 80, 200],
        [1.0, 220, 180, 255],
      ]);
    case 'yellow-green':
      return rampLut([
        [0.0, 5, 20, 5],
        [0.4, 80, 130, 30],
        [0.7, 180, 220, 60],
        [1.0, 255, 255, 180],
      ]);
    default: {
      const _exhaustive: never = id;
      throw new Error(`buildPaletteLut: unknown palette id "${String(_exhaustive)}"`);
    }
  }
}

/**
 * Interpolate a set of colour anchors into a PALETTE_LUT_SIZE×4 Uint8Array.
 *
 * Each anchor is [t, r, g, b] where t ∈ [0, 1] is the normalised position
 * along the LUT.  Alpha is NOT in the anchor; it is derived from t itself
 * (alpha = round(t * 255)), giving a linear opacity ramp that makes the
 * lowest-density voxels fully transparent and the densest fully opaque.
 *
 * Why linear alpha rather than letting each palette define its own ramp:
 * The opacity ramp is a global artistic choice that lives outside palette
 * colour science — we want all palettes to behave the same way so users
 * can switch palettes without recalibrating the opacity slider.  A uniform
 * linear ramp is also the easiest contract for the WGSL sampler to reason
 * about.
 */
function rampLut(anchors: ReadonlyArray<readonly [number, number, number, number]>): Uint8Array {
  const out = new Uint8Array(PALETTE_LUT_SIZE * 4);
  for (let i = 0; i < PALETTE_LUT_SIZE; i++) {
    const t = i / (PALETTE_LUT_SIZE - 1);
    let aIdx = 0;
    for (let j = 0; j < anchors.length - 1; j++) {
      if (t >= anchors[j]![0] && t <= anchors[j + 1]![0]) {
        aIdx = j;
        break;
      }
    }
    const a = anchors[aIdx]!;
    const b = anchors[aIdx + 1] ?? a;
    const span = b[0] - a[0];
    const u = span > 0 ? (t - a[0]) / span : 0;
    out[i * 4 + 0] = Math.round(a[1] + (b[1] - a[1]) * u);
    out[i * 4 + 1] = Math.round(a[2] + (b[2] - a[2]) * u);
    out[i * 4 + 2] = Math.round(a[3] + (b[3] - a[3]) * u);
    out[i * 4 + 3] = Math.round(t * 255);
  }
  return out;
}
