// texturedDisks/fragment.wesl — textured galaxy-disk fragment stage.
//
// Samples the texture atlas, applies a soft circular mask to round
// the corners of the (square) UV rectangle, and gates alpha by
// luminance so the dark sky in the SDSS / DSS cutout JPEGs bleeds
// transparent against the catalogue dot field.
//
// The disk geometry is already tilted in world space by the vertex
// stage, so the on-screen shape is a true ellipse from projection —
// the mask just rounds the four corners of the (square) UV space, it
// doesn't generate the ellipse itself.
//
// ## Why bindings are declared here, not in io.wesl
//
// Same WESL no-global-state argument as elsewhere. The atlas texture
// + sampler bindings are fragment-only (the vertex stage never
// samples), so they live here. The uniform binding is duplicated
// from vertex.wesl because the fragment stage technically receives
// the same @group(0) bind group at draw time even though the WGSL
// fragment entry doesn't read 'u' — the diskRenderer's bind-group
// layout still lists binding 0, so we keep the WGSL declaration in
// sync to avoid a layout mismatch.
//
// (In the original single-file shader the uniform read happened in
// the vertex stage only; binding 0 was tagged @group(0) once at
// module scope and the WebGPU pipeline-layout introspection picked
// it up as VERTEX-only. With two modules each declaring the binding
// is conditional on whether the entry actually consumes it — the
// fragment module here intentionally doesn't declare the uniform,
// keeping the binding's visibility VERTEX-only as it was before.)

import package::texturedDisks::io::VsOut;
// Shared fragment-stage mask shapes — see 'lib/masks.wesl' for the
// rationale (three smoothstep patterns recurred across four shaders,
// naming the shapes makes the intent visible at the call site).
import package::lib::masks::circularMask;
import package::lib::masks::lumAlpha;

@group(0) @binding(1) var          atlasTex:  texture_2d<f32>;
@group(0) @binding(2) var          atlasSmp:  sampler;
// Hi-res LOD texture array (Task R3). Appended after the atlas
// bindings to match the BGL slot order set up in
// 'instancedQuadRenderer.ts' when 'atlas.hiResArray' is configured.
// Each layer is a full-resolution thumbnail for one famous galaxy;
// the per-instance 'hiResLayerIdx' selects the layer to sample, or
// is -1 to mean 'no hi-res slot bound — keep the atlas sample'.
@group(0) @binding(3) var          hiResTex:  texture_2d_array<f32>;
@group(0) @binding(4) var          hiResSmp:  sampler;

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let rgba = textureSample(atlasTex, atlasSmp, in.atlasUv);
  // Hi-res crossfade (Task R3). WGSL requires 'textureSample' to be
  // called from uniform control flow — it computes implicit derivatives
  // across the 2x2 quad — so we cannot gate it inside an 'if' that
  // branches on a per-instance varying. Instead, sample unconditionally
  // with 'textureSampleLevel' (explicit LOD, no derivatives required)
  // using a clamped layer index, and gate the BLEND FACTOR rather than
  // the sample call. When the instance has no bound layer
  // ('hiResLayerIdx < 0'), 'mixAmt' collapses to 0 so 'mix' returns
  // 'rgba' unchanged — atlas-tile-only rendering preserved.
  //
  // 'textureSampleLevel' with explicit LOD 0 is correct here because
  // the hi-res array texture is created without mip levels (see
  // 'hiResFamousTexture.ts'), so there is no mip chain to select from.
  let safeLayer = max(in.hiResLayerIdx, 0);
  let hiSample = textureSampleLevel(hiResTex, hiResSmp, in.cornerUv, safeLayer, 0.0);
  let mixAmt = select(0.0, in.hiResCrossfadeAlpha, in.hiResLayerIdx >= 0);
  let c = mix(rgba, hiSample, mixAmt);
  // Soft circular mask — the disk geometry is already tilted in world
  // space, so the on-screen shape is a true ellipse from projection;
  // the mask just rounds the four corners of the (square) UV space.
  let r = length(in.cornerUv - vec2<f32>(0.5, 0.5));
  let mask = circularMask(r, 0.45, 0.5);
  // Brightness-derived alpha — same trick as quads.wesl, lets the dark
  // sky in the cutout JPEG bleed transparent against the dot field.
  // Applied to the BLENDED 'c' so a hi-res tile's dark sky is gated
  // identically to the atlas tile's.
  let lum = max(c.r, max(c.g, c.b));
  let lumGate = lumAlpha(lum, 0.05, 0.30);
  let alpha = lumGate * mask * in.fadeAlpha;
  // Discard near-transparent fragments so we don't waste blend
  // bandwidth on near-zero contributions.  See 'quads.wesl' for
  // the longer note — same reasoning applies here.
  if (alpha < 0.01) { discard; }
  return vec4<f32>(c.rgb * alpha, alpha);
}
