/**
 * rampLut — interpolate a set of colour anchors into a `size`×4 RGBA8
 * `Uint8Array` lookup table.
 *
 * Each anchor is `[t, r, g, b]` or `[t, r, g, b, a]` where t ∈ [0, 1] is
 * the normalised position along the LUT.  If every anchor omits the
 * alpha field, the alpha channel falls back to a linear ramp from t —
 * the sequential-palette behaviour (low values fully transparent, high
 * values fully opaque).  If *any* anchor includes alpha, all anchors are
 * interpolated for alpha just like for RGB, which lets divergent
 * palettes specify the V-shaped opacity they need (visible at both ends,
 * transparent at the centre).
 *
 * Why linear alpha as the default rather than always per-anchor: the
 * opacity ramp is a global artistic choice for sequential palettes — all
 * of them should behave the same way so users can switch palettes
 * without recalibrating the opacity slider.  A uniform linear ramp is
 * also the easiest contract for the WGSL sampler to reason about.
 * Divergent palettes break that symmetry by design, hence the per-anchor
 * override.
 *
 * `size` is passed in rather than read from a palette constant so the
 * function stays free of any palette-module coupling — the LUT length is
 * the caller's concern.
 *
 * Preconditions: `anchors.length >= 2`, sorted ascending by t, with
 * `anchors[0][0] === 0` and the last anchor's t === 1.  Not validated —
 * adding runtime guards for an internal helper would be noise.
 */

import type { RampAnchor } from '../../@types/color/RampAnchor';

export function rampLut(anchors: ReadonlyArray<RampAnchor>, size: number): Uint8Array {
  const out = new Uint8Array(size * 4);
  // If any anchor specifies an explicit alpha, interpolate alpha across
  // all anchors instead of using the linear-from-t fallback.  Mixing
  // explicit and implicit alpha within one palette would be ambiguous
  // (what's the implicit value at an anchor where alpha was omitted?),
  // so we treat the per-anchor mode as all-or-nothing: callers either
  // declare alpha at every anchor or at no anchor.
  const useExplicitAlpha = anchors.some((a) => a.length === 5);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
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
