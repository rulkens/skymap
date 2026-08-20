// points/pickFragment.wesl — offscreen r32uint picking fragment.
//
// Sister file to 'colorFragment.wesl'. Both consume the same VSOut
// produced by 'vertex.wesl', but this one writes a 32-bit unsigned
// integer (the packed source/instance identity) instead of a colour.
// Splitting the two fragments into separate modules eliminates a class
// of selection-on-wrong-galaxy bugs that came from one shader module
// servicing two pipelines with diverging fragment paths.
//
// ## What the pick pass does
//
// Re-renders the scene into a tiny offscreen 'r32uint' texture where
// each fragment writes the packed identity of the billboard covering it.
// JS reads back the texel under the cursor and decodes it; 0 is the
// cleared-background sentinel.
//
// ## Why this fragment is a plain dot
//
// The point pick is clamped to 'u.pointSizePx' (the dot floor) in the
// vertex stage — the procedural-disk pass now owns resolved-galaxy
// picking at the disk edge, so inflating the billboard to the apparent-
// size circle would create a large invisible click area on top of the
// disk. A plain unit-circle test is correct and cheap.
//
// ## Why this fragment declares NO bindings
//
// 'fsPick' only reads VSOut fields ('in.uv' + 'in.instanceIdx') — no
// uniforms touched here. The SHARED vertex stage in 'vertex.wesl'
// declares '@group(0)' (per-frame Uniforms) and '@group(2)' (per-
// source SourceUniforms); the pick pipeline binds those plus a
// no-op '@group(1)' FadeUniforms (opacity = 1) so its pipeline
// layout matches the visual pipeline's exactly. See galaxyPickRenderer.ts
// for the shared-fade-buffer wiring.

import package::galaxyCatalog::points::io::VSOut;
import package::lib::selectionEncoding::PICK_SENTINEL_OFFSET;

// ─── pick fragment stage ──────────────────────────────────────────────
//
// 'fsPick' writes 'vec4<u32>' to @location(0), which maps to the
// 'r32uint' render target declared on the JS side. No blend state on
// the pipeline because integer formats can't be blended; depth test
// resolves overlapping points instead.

@fragment
fn fsPick(in: VSOut) -> @location(0) vec4<u32> {
  // Plain dot: discard fragments outside the unit circle.
  if (dot(in.uv, in.uv) > 1.0) { discard; }

  // Write '(sourceCode << 26 | instance_index) + 1' so background
  // pixels (cleared to 0) are distinguishable from a real hit. The +1
  // keeps 0 as the unambiguous 'no hit' sentinel; even with sourceCode
  // = 0 (the Synthetic galaxy catalog) and localIdx = 0 the written value is
  // 1, never 0.
  //
  // 'in.instanceIdx' was assembled in the vertex stage from
  // '(source.sourceCode << 26u) | @builtin(instance_index)'. The
  // packing gives every galaxy catalog a structurally-disjoint identity range
  // (top 6 bits = source code, bottom 26 = local index <= 67M), so
  // two galaxies in different galaxy catalogs can never collide on the same
  // pick value.
  //
  // The g/b/a channels are unused — we only read the r channel back
  // on the JS side. Filling them with 0 keeps the output well-defined.
  return vec4<u32>(in.instanceIdx + PICK_SENTINEL_OFFSET, 0u, 0u, 0u);
}
