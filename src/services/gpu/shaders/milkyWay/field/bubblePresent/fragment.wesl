// bubblePresent/fragment.wesl — a SHELL, not a filled disc: the catalog
// places up to ~240 overlapping bubbles/cavities across one galaxy, and a
// filled disc turns a crowded field into one indistinguishable blob. Alpha
// peaks at the quad's own |uv| == 1 (the placement's world radius) and
// falls off both inward and outward — the same "band around a ring" idiom
// as structureMarker/ring.wesl, but camera-facing rather than world-plane-
// facing (a bubble has no orientation to be plane-aligned to).

import package::milkyWay::field::bubblePresent::io::VsOut;
import package::milkyWay::field::io::u;

// Warm amber for a relic bubble (old, swept-out), cool cyan for an actively-
// blown HII cavity — geometrically identical quads, so hue is the only cue
// separating the two populations.
const RELIC_COLOR: vec3<f32> = vec3<f32>(1.0, 0.65, 0.25);
const CAVITY_COLOR: vec3<f32> = vec3<f32>(0.3, 0.8, 1.0);
// Half-width, in UV units, of the solid core of the ring band and of its
// falloff — mirrors structureMarker/ring.wesl's bandInner/bandOuter, just
// without that shader's pixel-exact AA (a debug overlay has no need for it).
const SHELL_INNER: f32 = 0.08;
const SHELL_OUTER: f32 = 0.55;

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  let distFromRing = abs(length(input.uv) - 1.0);
  let shell = 1.0 - smoothstep(SHELL_INNER, SHELL_OUTER, distFromRing);
  let color = select(RELIC_COLOR, CAVITY_COLOR, input.kind > 0.5);
  // u.bubbleView.x is this view's own crossfade weight (io.wesl's bubbleView
  // doc) — 0 makes every fragment fully transparent, matching the other
  // debug presents' own intensity multiply.
  let a = shell * u.bubbleView.x;
  // Alpha 0: additive blend (ADDITIVE_BLEND) sums colour directly; the
  // alpha channel feeds nothing downstream, same convention splat.wesl's fs
  // documents for its own return.
  return vec4<f32>(color * a, 0.0);
}
