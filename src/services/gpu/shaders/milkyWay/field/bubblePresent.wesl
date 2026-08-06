// milkyWay/field/bubblePresent.wesl — debug overlay for the SF-event
// catalog's own bubble/cavity placements (dustBubblePlacements.ts): a
// SECOND, independent star-formation model nobody has ever seen, drawn as
// its own layer so it can be compared directly against the SSPSF
// automaton's ismMap view (ismMapPresent.wesl) — two models of the same
// physics, side by side. One instanced camera-facing quad per placement;
// createGalaxyEngine.ts's 'rebuildBubblePlacements' is the only producer of
// the instance buffer this reads (center.xyz, radius, kind).
//
// A SHELL, not a filled disc: the catalog places up to ~240 overlapping
// bubbles/cavities across one galaxy, and a filled disc turns a crowded
// field into one indistinguishable blob. Alpha peaks at the quad's own
// |uv| == 1 (the placement's world radius) and falls off both inward and
// outward — the same "band around a ring" idiom as
// structureMarker/ring.wesl, but camera-facing rather than world-plane-
// facing (a bubble has no orientation to be plane-aligned to).

import package::lib::billboard::quadCorner;
import package::milkyWay::field::io::u;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) @interpolate(flat) kind: f32,
}

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @location(0) centerAndRadius: vec4<f32>,
  @location(1) kind: f32,
) -> VsOut {
  let corner = quadCorner(vi);
  let center = centerAndRadius.xyz;
  let r = centerAndRadius.w;

  let eye = u.eye.xyz;
  let camRight = u.camRight.xyz;
  let camUp = u.camUp.xyz;
  let camFwd = u.camFwd.xyz;
  let tanHalfFov = u.params.x;
  let aspect = u.params.y;
  let shift = u.params.z;

  var out: VsOut;
  out.kind = kind;
  out.uv = corner;

  // camRight/camUp/camFwd are the orthonormal camera basis (the view
  // matrix's own rows — see io.wesl's header), so offsetting along
  // camRight/camUp can never change the view-space depth zv: only xv/yv
  // shift, by the corner's own radius-scaled offset. Same simplification
  // splat.wesl's vs relies on implicitly by never touching zv per-corner.
  let rel = center - eye;
  let zv = dot(rel, camFwd);
  let xv = dot(rel, camRight) + corner.x * r;
  let yv = dot(rel, camUp) + corner.y * r;

  // Behind the camera: collapse the quad rather than let the divide below
  // scatter a degenerate corner across the screen — same guard
  // lib/splatSilhouette.wesl's splatNdc uses for the same reason.
  if (zv < 1e-3) {
    out.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    return out;
  }
  let ndcX = xv / zv / (tanHalfFov * aspect) - shift;
  let ndcY = yv / zv / tanHalfFov;
  out.pos = vec4<f32>(ndcX, ndcY, 0.0, 1.0);
  return out;
}

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
