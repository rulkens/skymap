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

import type { ScalarFieldPaletteId } from '../@types/data/ScalarFieldPaletteId';

export const PALETTE_LUT_SIZE = 256;

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
];

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
    case 'inferno':
      // Matplotlib's `inferno` perceptually-uniform palette: dark
      // purple → red → orange → pale yellow on a near-black floor.
      // Slightly more orange-saturated than magma, which makes it the
      // canonical match for slime-mould / cosmic-web fire-on-black
      // visualisations (Polyphorm, MCPM, plasma family). Anchor RGB
      // values match matplotlib's `_cm_listed.py` inferno entries
      // sampled at t = {0, 0.25, 0.5, 0.75, 1.0}.
      return rampLut([
        [0.0, 0, 0, 4],
        [0.25, 87, 16, 110],
        [0.5, 188, 55, 84],
        [0.75, 249, 142, 9],
        [1.0, 252, 255, 164],
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
      return rampLut([
        [0.0, 20, 60, 180, 220],   // deep void: saturated blue, mostly opaque
        [0.25, 90, 140, 230, 130], // cool blue, half-transparent
        [0.5, 245, 245, 240, 0],   // cosmic mean: neutral, fully transparent
        [0.75, 230, 130, 90, 130], // warm orange, half-transparent
        [1.0, 180, 30, 30, 240],   // cluster core: saturated red, near-opaque
      ]);
    default: {
      const _exhaustive: never = id;
      throw new Error(`buildPaletteLut: unknown palette id "${String(_exhaustive)}"`);
    }
  }
}

/**
 * Anchor for `rampLut`: either `[t, r, g, b]` (alpha = linear ramp from
 * t) or `[t, r, g, b, a]` (alpha taken from the anchor).  The two
 * shapes can be mixed within a palette's anchor list — any anchor with
 * an explicit alpha switches the *whole* LUT to per-anchor alpha
 * interpolation; otherwise the default linear-ramp behaviour applies.
 *
 * Why the union rather than always-explicit-alpha: the four sequential
 * palettes (viridis, magma, blue-purple, yellow-green) shipped before
 * coolwarm existed and would all need explicit alpha specified at every
 * anchor — noise that obscures their colour-only intent.  Keeping
 * `[t, r, g, b]` as the default makes the sequential cases concise and
 * forces divergent palettes (which need V-shaped alpha) to declare it.
 */
type RampAnchor =
  | readonly [t: number, r: number, g: number, b: number]
  | readonly [t: number, r: number, g: number, b: number, a: number];

/**
 * Interpolate a set of colour anchors into a PALETTE_LUT_SIZE×4 Uint8Array.
 *
 * Each anchor is `[t, r, g, b]` or `[t, r, g, b, a]` where t ∈ [0, 1] is
 * the normalised position along the LUT.  If every anchor omits the
 * alpha field, the alpha channel falls back to a linear ramp from t —
 * the original sequential-palette behaviour (low values fully
 * transparent, high values fully opaque).  If *any* anchor includes
 * alpha, all anchors are interpolated for alpha just like for RGB,
 * which lets divergent palettes specify the V-shaped opacity they
 * need (visible at both ends, transparent at the centre).
 *
 * Why linear alpha as the default rather than always per-anchor: the
 * opacity ramp is a global artistic choice for sequential palettes — we
 * want all four (viridis, magma, blue-purple, yellow-green) to behave
 * the same way so users can switch palettes without recalibrating the
 * opacity slider.  A uniform linear ramp is also the easiest contract
 * for the WGSL sampler to reason about.  Divergent palettes break that
 * symmetry by design, hence the per-anchor override.
 */
// Preconditions: anchors length >= 2, sorted ascending by t, with
// anchors[0][0] === 0 and anchors[anchors.length-1][0] === 1.  All
// current call sites satisfy this; the function does not validate it
// because adding runtime guards for an internal helper would be noise.
function rampLut(anchors: ReadonlyArray<RampAnchor>): Uint8Array {
  const out = new Uint8Array(PALETTE_LUT_SIZE * 4);
  // If any anchor specifies an explicit alpha, interpolate alpha across
  // all anchors instead of using the linear-from-t fallback.  Mixing
  // explicit and implicit alpha within one palette would be ambiguous
  // (what's the implicit value at an anchor where alpha was omitted?),
  // so we treat the per-anchor mode as all-or-nothing: callers either
  // declare alpha at every anchor or at no anchor.  The single check
  // here enforces that distinction at LUT-build time rather than via
  // type gymnastics.
  const useExplicitAlpha = anchors.some((a) => a.length === 5);
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
    if (useExplicitAlpha) {
      const aAlpha = a[4] ?? 0;
      const bAlpha = b[4] ?? 0;
      out[i * 4 + 3] = Math.round(aAlpha + (bAlpha - aAlpha) * u);
    } else {
      out[i * 4 + 3] = Math.round(t * 255);
    }
  }
  return out;
}
