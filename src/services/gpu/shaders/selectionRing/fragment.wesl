// selectionRing/fragment.wesl — annulus mask + pure-white output.
//
// Annulus geometry:
//   outer edge:   r² <= 1.0  (the quad's inscribed circle)
//   inner edge:   r² <= (1 - bandFraction)²
//   bandFraction: min(0.15, 4 / max(ringRadiusPx, 1)) — caps stroke
//                 width at ~4 px until the ring is small enough that 4
//                 px exceeds 15 % of the radius, then falls back to the
//                 15 % proportional cap.
//
// Soft anti-aliased edges via smoothstep with a window 1/10th of the
// band width on each side.
//
// ## Output colour
//
// Pure white, premultiplied alpha ('vec4(alpha, alpha, alpha, alpha)').
// Post-tone-map UI overlay, so HDR boost isn't available — and isn't
// needed.  No tint, no per-galaxy colour.
//
// Bindings: this stage reads only the 'VsOut' varyings (no uniform
// access), so no '@group/@binding' declarations are needed.

import package::selectionRing::io::VsOut;

// The annulus mask + colour body, factored out of the '@fragment fn fs'
// entry so the scene-attenuated variant (selectionRing/fragmentOcclude.wesl)
// scales this exact result rather than re-deriving it — one source of truth
// for the ring shape.  The interior 'discard' statements are valid inside a
// called function: WGSL permits 'discard' anywhere in a fragment's call
// tree, so both entries inherit the annulus's own culling.
fn shadeRing(input: VsOut) -> vec4<f32> {
  // Radial distance² from the quad centre.  UV is in [-1, +1]², so
  // 'dot(uv, uv)' is r² in unit-quad space.
  let r2 = dot(input.uv, input.uv);

  // Outside the outer disc — discard before the smoothstep can leak
  // fragments to clamped-zero alpha.
  if (r2 > 1.0) { discard; }

  let bandFraction = min(0.15, 4.0 / max(input.ringRadiusPx, 1.0));
  let innerR = 1.0 - bandFraction;
  let r = sqrt(r2);

  // Inside the inner disc — the ring is hollow.
  if (r < innerR) { discard; }

  // Soft edges on both sides of the band; window = 1/10th of band width.
  let edgeFade = bandFraction * 0.1;
  let inEdge   = smoothstep(innerR, innerR + edgeFade, r);
  let outEdge  = 1.0 - smoothstep(1.0 - edgeFade, 1.0, r);
  let alpha    = inEdge * outEdge;

  // Premultiplied-alpha OVER blend (set on the JS pipeline descriptor).
  return vec4<f32>(alpha, alpha, alpha, alpha);
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  return shadeRing(input);
}
