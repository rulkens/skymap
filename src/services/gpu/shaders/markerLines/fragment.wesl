// markerLines/fragment.wesl — soft-edged thick-line fragment stage.
//
// Outputs the per-instance colour modulated by a soft anti-aliased
// edge falloff perpendicular to the line.  The uv.y coordinate runs
// 0..1 across the line's width (uv.y = 0 / 1 are the line edges,
// uv.y = 0.5 is the center), so a triangular distance from center
// is 'abs(uv.y - 0.5) * 2' — 0 at the center, 1 at the edges.
//
// 'fwidth' gives roughly one pixel's worth of distance at this
// fragment's scale, so the smoothstep band is one pixel wide
// regardless of viewport size — same anti-aliasing recipe MSDF text
// uses, but in a 1D rather than 2D distance field.
//
// Output is premultiplied (rgb * a, a) — the renderer's blend state
// expects premultiplied OVER, NOT additive.  Marker lines are UI
// overlay (the "you are here" indicator), not emissive content.

import package::markerLines::io::VsOut;

// The soft-edged thick-line shading body, factored out of the
// '@fragment fn fs' entry so the scene-attenuated variant
// (markerLines/fragmentOcclude.wesl) scales this exact result rather
// than re-deriving it — one source of truth for line colour.
fn shadeLine(input: VsOut) -> vec4<f32> {
  // Triangular distance from the line's centerline: 0 at center, 1 at
  // either edge.  uv.y in [0, 1] is the across-line coordinate.
  let edgeDist = abs(input.uv.y - 0.5) * 2.0;
  // Anti-aliased edge falloff.  The smoothstep band is one pixel
  // wide (via fwidth) so the line stays crisp at any line width.
  let aa = fwidth(edgeDist);
  let edgeAlpha = 1.0 - smoothstep(1.0 - aa, 1.0, edgeDist);

  // The vertex stage already pre-multiplied fadeAlpha into the colour,
  // so all that's left is to multiply by the edge falloff.  Output is
  // premultiplied: rgb already carries 'originalRgb * fadeAlpha', so
  // multiplying through by edgeAlpha keeps the (rgb * a) invariant.
  return input.color * edgeAlpha;
}

@fragment
fn fs(input: VsOut) -> @location(0) vec4<f32> {
  return shadeLine(input);
}
