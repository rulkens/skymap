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
 *   - viridis                  : matplotlib's cool perceptual gradient
 *                                 (blue→green→yellow).  Default fallback;
 *                                 reads as scientific/neutral.
 *   - magma                    : matplotlib's warm perceptual gradient
 *                                 (black→purple→orange→cream).  Useful
 *                                 when a dataset should "feel hot" — e.g.,
 *                                 a future X-ray or thermal field — so it
 *                                 reads visually distinct from viridis.
 *   - blue-purple              : CF-4 default; matches the Pomarède/Tully
 *                                 publication aesthetic for cosmography.
 *   - yellow-green             : MCPM default; deliberately distinct from
 *                                 blue-purple so the two layers read as
 *                                 separate overlays when both are on.
 *   - coolwarm                 : divergent blue→neutral→red with V-shaped
 *                                 alpha.  For fields centred on a meaningful
 *                                 zero (CF-4 density contrast, velocity
 *                                 divergence) where voids AND overdensities
 *                                 are both interesting and the cosmic mean
 *                                 should fade out.
 *
 * Adding a new palette: extend the union type in ScalarCube.d.ts, add a
 * builder branch here, regenerate any binaries that should reference it.
 * The renderer reads `paletteId` from the cube header — no other touch
 * points.
 */

import type { RampAnchor } from '../../@types/color/RampAnchor';
import type { ScalarFieldPaletteId } from '../../@types/data/volume/ScalarFieldPaletteId';
import { rampLut } from '../../utils/color/rampLut';

export const PALETTE_LUT_SIZE = 256;

type PolyphormPaletteId = Exclude<
  ScalarFieldPaletteId,
  'viridis' | 'magma' | 'inferno' | 'blue-purple' | 'yellow-green' | 'coolwarm'
>;

// Polyphorm's shipped gradients (vendor bin/data/palette_*.tga), each sampled at
// 12 even positions along the TGA's middle row — data, not hand-tuned anchors, so
// re-deriving them is mechanical if the vendor set ever changes. All sequential
// (linear-alpha fallback); 'magma-poly' is their palette_magma.tga (see the id union).
// prettier-ignore
const POLYPHORM_RAMPS: Record<PolyphormPaletteId, readonly RampAnchor[]> = {
  'blue': [[0, 24, 0, 18], [0.091, 14, 0, 21], [0.182, 14, 1, 32], [0.273, 15, 5, 41], [0.364, 17, 10, 67], [0.455, 22, 15, 97], [0.545, 24, 19, 131], [0.636, 25, 24, 169], [0.727, 27, 34, 200], [0.818, 35, 49, 207], [0.909, 42, 71, 218], [1, 68, 105, 227]],
  'cliff3': [[0, 1, 0, 12], [0.091, 4, 2, 112], [0.182, 0, 16, 129], [0.273, 1, 23, 156], [0.364, 12, 29, 192], [0.455, 29, 40, 220], [0.545, 67, 52, 242], [0.636, 111, 67, 250], [0.727, 173, 88, 228], [0.818, 234, 108, 168], [0.909, 255, 153, 80], [1, 255, 242, 128]],
  'coldhot': [[0, 0, 0, 33], [0.091, 0, 0, 118], [0.182, 0, 0, 212], [0.273, 34, 0, 255], [0.364, 103, 0, 255], [0.455, 175, 25, 230], [0.545, 242, 67, 188], [0.636, 255, 115, 141], [0.727, 255, 158, 97], [0.818, 255, 202, 53], [0.909, 255, 248, 7], [1, 255, 255, 230]],
  'eagle': [[0, 0, 0, 0], [0.091, 80, 75, 253], [0.182, 37, 134, 246], [0.273, 9, 190, 233], [0.364, 56, 232, 216], [0.455, 101, 252, 194], [0.545, 147, 253, 169], [0.636, 190, 237, 142], [0.727, 237, 200, 111], [0.818, 255, 145, 77], [0.909, 255, 85, 43], [1, 255, 12, 6]],
  'eagle2': [[0, 18, 0, 48], [0.091, 14, 0, 111], [0.182, 1, 0, 143], [0.273, 0, 4, 162], [0.364, 0, 62, 195], [0.455, 0, 159, 149], [0.545, 8, 241, 22], [0.636, 76, 255, 0], [0.727, 198, 237, 9], [0.818, 252, 147, 40], [0.909, 255, 48, 23], [1, 255, 2, 1]],
  'gogh-blue': [[0, 21, 0, 15], [0.091, 11, 1, 25], [0.182, 16, 5, 43], [0.273, 20, 11, 69], [0.364, 33, 23, 131], [0.455, 46, 37, 193], [0.545, 60, 53, 223], [0.636, 76, 78, 242], [0.727, 105, 124, 249], [0.818, 144, 175, 251], [0.909, 174, 207, 253], [1, 221, 238, 255]],
  'gogh-green': [[0, 0, 0, 0], [0.091, 23, 102, 111], [0.182, 32, 135, 126], [0.273, 40, 147, 120], [0.364, 49, 163, 105], [0.455, 57, 178, 91], [0.545, 72, 193, 66], [0.636, 95, 207, 41], [0.727, 135, 215, 50], [0.818, 174, 223, 65], [0.909, 215, 234, 103], [1, 240, 244, 176]],
  'hot': [[0, 0, 0, 0], [0.091, 47, 0, 0], [0.182, 91, 0, 0], [0.273, 137, 9, 0], [0.364, 183, 56, 0], [0.455, 231, 103, 0], [0.545, 254, 147, 18], [0.636, 255, 195, 67], [0.727, 255, 240, 113], [0.818, 254, 254, 160], [0.909, 254, 254, 203], [1, 254, 254, 250]],
  'magma-poly': [[0, 0, 0, 0], [0.091, 79, 0, 143], [0.182, 107, 1, 229], [0.273, 132, 5, 254], [0.364, 153, 11, 195], [0.455, 171, 22, 84], [0.545, 188, 40, 0], [0.636, 201, 61, 0], [0.727, 216, 93, 0], [0.818, 229, 135, 0], [0.909, 242, 181, 0], [1, 254, 244, 0]],
  'magneto2': [[0, 1, 0, 2], [0.091, 67, 19, 120], [0.182, 51, 48, 138], [0.273, 35, 78, 147], [0.364, 20, 104, 147], [0.455, 7, 129, 143], [0.545, 1, 155, 131], [0.636, 7, 180, 108], [0.727, 48, 200, 77], [0.818, 113, 214, 31], [0.909, 187, 225, 0], [1, 255, 231, 0]],
  'sunset2': [[0, 0, 4, 5], [0.091, 0, 28, 48], [0.182, 0, 54, 79], [0.273, 19, 74, 87], [0.364, 39, 84, 81], [0.455, 82, 92, 75], [0.545, 173, 97, 62], [0.636, 255, 112, 45], [0.727, 255, 148, 31], [0.818, 255, 192, 13], [0.909, 255, 243, 8], [1, 255, 255, 71]],
  'sunset3': [[0, 0, 4, 4], [0.091, 0, 27, 63], [0.182, 0, 56, 104], [0.273, 0, 78, 104], [0.364, 3, 87, 81], [0.455, 67, 87, 53], [0.545, 225, 67, 0], [0.636, 255, 64, 0], [0.727, 255, 117, 0], [0.818, 255, 185, 0], [0.909, 255, 255, 0], [1, 255, 255, 0]],
  'tropico': [[0, 0, 1, 3], [0.091, 15, 28, 112], [0.182, 29, 54, 216], [0.273, 13, 161, 204], [0.364, 2, 240, 171], [0.455, 7, 238, 99], [0.545, 12, 236, 22], [0.636, 95, 244, 13], [0.727, 209, 255, 26], [0.818, 225, 255, 22], [0.909, 237, 255, 18], [1, 250, 255, 13]],
  'vaneyck-green': [[0, 32, 42, 23], [0.091, 59, 74, 28], [0.182, 80, 98, 24], [0.273, 83, 121, 21], [0.364, 85, 140, 16], [0.455, 92, 157, 28], [0.545, 106, 176, 47], [0.636, 133, 194, 68], [0.727, 160, 208, 83], [0.818, 196, 223, 118], [0.909, 232, 239, 171], [1, 249, 249, 223]],
  'vaneyck-red': [[0, 63, 10, 28], [0.091, 93, 20, 38], [0.182, 110, 27, 42], [0.273, 131, 36, 44], [0.364, 154, 47, 48], [0.455, 175, 58, 49], [0.545, 194, 85, 59], [0.636, 210, 116, 78], [0.727, 217, 149, 92], [0.818, 227, 179, 114], [0.909, 235, 215, 149], [1, 240, 237, 214]],
};

/**
 * Enumerated list of every supported palette id, in the order the UI
 * should show them in a dropdown.  Kept in this module (rather than
 * derived at runtime from the `ScalarFieldPaletteId` union) because TS
 * unions don't survive into JS — we'd otherwise need a second source of
 * truth in the React layer just to populate a `<select>`.
 */
export const PALETTE_IDS: readonly ScalarFieldPaletteId[] = [
  'viridis',
  'magma',
  'inferno',
  'blue-purple',
  'yellow-green',
  'coolwarm',
  ...Object.keys(POLYPHORM_RAMPS).sort(),
] as readonly ScalarFieldPaletteId[];

export function buildPaletteLut(id: ScalarFieldPaletteId): Uint8Array {
  switch (id) {
    case 'viridis':
      return rampLut(
        [
          [0.0, 68, 1, 84],
          [0.25, 59, 82, 139],
          [0.5, 33, 144, 141],
          [0.75, 94, 201, 98],
          [1.0, 253, 231, 37],
        ],
        PALETTE_LUT_SIZE,
      );
    case 'magma':
      return rampLut(
        [
          [0.0, 0, 0, 4],
          [0.25, 80, 18, 123],
          [0.5, 182, 54, 121],
          [0.75, 252, 137, 97],
          [1.0, 252, 253, 191],
        ],
        PALETTE_LUT_SIZE,
      );
    case 'inferno':
      // Matplotlib's `inferno` perceptually-uniform palette: dark
      // purple → red → orange → pale yellow on a near-black floor.
      // Slightly more orange-saturated than magma, which makes it the
      // canonical match for slime-mould / cosmic-web fire-on-black
      // visualisations (Polyphorm, MCPM, plasma family). Anchor RGB
      // values match matplotlib's `_cm_listed.py` inferno entries
      // sampled at t = {0, 0.25, 0.5, 0.75, 1.0}.
      return rampLut(
        [
          [0.0, 0, 0, 4],
          [0.25, 87, 16, 110],
          [0.5, 188, 55, 84],
          [0.75, 249, 142, 9],
          [1.0, 252, 255, 164],
        ],
        PALETTE_LUT_SIZE,
      );
    case 'blue-purple':
      return rampLut(
        [
          [0.0, 5, 5, 30],
          [0.4, 60, 30, 150],
          [0.7, 140, 80, 200],
          [1.0, 220, 180, 255],
        ],
        PALETTE_LUT_SIZE,
      );
    case 'yellow-green':
      return rampLut(
        [
          [0.0, 5, 20, 5],
          [0.4, 80, 130, 30],
          [0.7, 180, 220, 60],
          [1.0, 255, 255, 180],
        ],
        PALETTE_LUT_SIZE,
      );
    case 'coolwarm':
      // Divergent palette with explicit per-anchor alpha (the optional
      // 5th element).  Voids (t=0) and clusters (t=1) are both visible;
      // the cosmic mean (t=0.5) is transparent so it fades into the
      // background rather than washing the scene with mid-tone fog.
      //
      // Colour anchors borrowed from matplotlib's `coolwarm` with the
      // neutral midpoint shifted slightly warm (245, 245, 240) so it
      // doesn't clash with the skymap UI's near-white background when
      // alpha leaks at the seams.
      return rampLut(
        [
          [0.0, 20, 60, 180, 220], // deep void: saturated blue, mostly opaque
          [0.25, 90, 140, 230, 130], // cool blue, half-transparent
          [0.5, 245, 245, 240, 0], // cosmic mean: neutral, fully transparent
          [0.75, 230, 130, 90, 130], // warm orange, half-transparent
          [1.0, 180, 30, 30, 240], // cluster core: saturated red, near-opaque
        ],
        PALETTE_LUT_SIZE,
      );
    default: {
      // The six literal cases above narrow `id` to PolyphormPaletteId here, so the
      // Record lookup stays compile-time exhaustive; the runtime throw still guards
      // ids arriving from untyped data (a cube header, a saved params file).
      const ramp = POLYPHORM_RAMPS[id];
      if (!ramp) throw new Error(`buildPaletteLut: unknown palette id "${String(id)}"`);
      return rampLut(ramp, PALETTE_LUT_SIZE);
    }
  }
}
