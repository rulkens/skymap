// texturedDisks/fragment.wesl — textured galaxy-disk fragment stage.
//
// Samples the texture atlas, applies a soft circular mask to round
// the corners of the (square) UV rectangle, and gates alpha by
// luminance so the dark sky in the SDSS / DSS cutout JPEGs bleeds
// transparent against the catalogue dot field.
//
// The disk geometry is already tilted in world space by the vertex
// stage, so the on-screen shape is a true ellipse from projection —
// the mask just rounds the four corners of the (square) UV space.
//
// ## Why bindings are declared here, not in io.wesl
//
// WESL has no global state — bindings are module-local. The atlas
// texture + sampler are fragment-only. The fragment stage
// intentionally does NOT declare the uniform binding: the WGSL
// pipeline-layout introspection then keeps binding 0's visibility
// as VERTEX-only, matching the renderer's BGL.

import package::texturedDisks::io::VsOut;
// Shared fragment-stage mask shapes — see 'lib/masks.wesl' for the
// rationale (three smoothstep patterns recurred across four shaders,
// naming the shapes makes the intent visible at the call site).
import package::lib::masks::circularMask;
import package::lib::masks::lumAlpha;

@group(0) @binding(1) var          atlasTex:  texture_2d<f32>;
@group(0) @binding(2) var          atlasSmp:  sampler;
// Hi-res LOD texture array — appended after the atlas bindings to match
// the BGL slot order set up in 'instancedQuadRenderer.ts' when
// 'atlas.hiResArray' is configured. Each layer is a full-resolution
// thumbnail for one famous galaxy; the per-instance 'hiResLayerIdx'
// selects the layer to sample, or -1 to mean 'no hi-res slot bound —
// keep the atlas sample'.
@group(0) @binding(3) var          hiResTex:  texture_2d_array<f32>;
@group(0) @binding(4) var          hiResSmp:  sampler;

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let rgba = textureSample(atlasTex, atlasSmp, in.atlasUv);
  // Hi-res crossfade. WGSL requires 'textureSample' to be called from
  // uniform control flow — it computes implicit derivatives across the
  // 2x2 quad — so we cannot gate it inside an 'if' that branches on a
  // per-instance varying. Instead sample unconditionally with
  // 'textureSampleLevel' (explicit LOD, no derivatives required) using
  // a clamped layer index, and gate the BLEND FACTOR rather than the
  // sample call. When 'hiResLayerIdx < 0', 'mixAmt' collapses to 0 so
  // 'mix' returns 'rgba' unchanged — atlas-tile-only rendering preserved.
  //
  // Explicit LOD 0 is correct because the hi-res array texture is
  // created without mip levels (see 'hiResFamousTexture.ts').
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
