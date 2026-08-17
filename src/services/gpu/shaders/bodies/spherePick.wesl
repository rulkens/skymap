// spherePick.wesl — analytic sphere pick for the NEAR0 foreground bodies (Earth,
// planets, resolved scene-star spheres).
//
// The pick twin of the visual sphere stages (star/planet/earth vertex.wesl):
// same body geometry, same 'clip_from_local' projection, but the
// fragment writes a 32-bit unsigned identity into an r32uint target instead of
// a colour. One module carries BOTH stages (vs + fsPick); bodyPickRenderer
// compiles it into its OWN GPUShaderModule for the sphere pipeline, never
// shared with the points pipeline (the WebGPU 'auto'-layout trap forbids
// sharing a compiled module across pipelines).
//
// ## Per-draw uniform (dynamic offset), not per-instance attributes
//
// Unlike the VISUAL planet stage — which instances every planet in one draw and
// reads a per-instance MVP so no mid-frame uniform exists to clobber — the pick
// contract records ONE sphere per 'drawSphere' call, each with its OWN packed
// id. bodyPickRenderer therefore binds this uniform through a 256-byte-aligned
// DYNAMIC OFFSET that advances per draw, so each of the <=10 sphere draws in a
// pass reads its OWN slot. A single shared slot written once per draw would lose
// to the writeBuffer-vs-submit race (every draw reading the last body's bytes);
// see bodyPickRenderer.ts for the full mechanism note.
//
// ## The mesh is a PROXY; the silhouette is analytic
//
// The tessellated sphere is rasterised at 'PROXY_SCALE' so it strictly
// circumscribes the body, and each fragment then recovers the real surface: cast
// a ray from 'camPosLocal' through its own proxy position and intersect the unit
// sphere ('lib/analyticSphere.wesl' holds the maths and its rationale). Missed
// fragments discard, so the clickable disc is the body's exact analytic disc
// rather than the 48-gon inscribed inside it -- the pick target agrees with the
// drawn limb BY CONSTRUCTION, instead of by two call sites reading one
// tessellation constant and hoping.
//
// Two consequences the pipeline must match:
//
//   - 'cullMode: front', so the proxy's FAR hemisphere rasterises (see
//     'PROXY_SCALE' for why front faces would drop the body on close approach).
//   - '@builtin(frag_depth)'. The rasteriser's interpolated depth belongs to the
//     PROXY -- the far shell, most of a body DIAMETER behind the true surface --
//     so leaving it alone would break the depth-tested nearest-wins overlap this
//     pass exists to get right (a Moon in front of Earth would lose to Earth).
//     The fragment projects the analytic hit through the SAME mvp instead, which
//     is byte-for-byte what the rasteriser would have produced had it drawn the
//     true surface. Cost: early-Z is off for this pipeline.
//
// ## The identity is written RAW
//
// 'packedId' arrives fully packed from the CPU
// ('packSelection(sourceCode, seedIndex + PICK_SENTINEL_OFFSET)', composed by
// the body layers). This stage writes it unchanged — no packing math on the GPU
// (that lives in TS, so the source-code / seed-index encoding has one home).
//
// ## Byte layout (uniform std140)
//
//   offset  0..63  mvp          mat4x4<f32>  (column-major, 64 B)
//   offset 64..75  camPosLocal  vec3<f32>    (16-byte aligned at 64)
//   offset 76..79  packedId     u32          (fills the vec3's trailing slot)
//   total: 80 bytes. bodyPickRenderer's scratch mirrors this exactly:
//   f32[0..15] = mvp, f32[16..18] = camPosLocal, u32[19] = packedId.
//
// 'packedId' sits in what a vec3 would otherwise waste. A vec3<f32> occupies 12
// bytes but demands 16-byte alignment, so the 4 bytes after it are unusable by
// anything wider than a scalar -- putting a REAL scalar field there is free,
// where declaring 'camPosLocal' AFTER 'packedId' would have cost a fresh
// 16-byte row and pushed the struct to 96. Same trick as
// 'RingUniforms.planetRadiusRatio' (lib/sphere.wesl). Because the struct size,
// the dynamic-offset slot stride and 'minBindingSize' are all unchanged, the
// per-draw slot mechanism below is untouched by the widening.
//
// 'camPosLocal' is the camera expressed in the frame where this body is the UNIT
// sphere, composed CPU-side by 'drawFlooredSpherePick' from the SAME floored
// pick radius the mvp is composed with -- the ray origin the analytic silhouette
// test below casts from. Oblateness rides along inside that frame: the model
// matrix already flattens the polar axis, so a squashed body is still the unit
// sphere here and needs no ellipsoid maths, provided the origin was carried
// across with the matching flattening (which is what 'camPosLocal's oblateness
// parameter does).

import package::lib::analyticSphere::PROXY_SCALE;
import package::lib::analyticSphere::fragDepthFromLocal;
import package::lib::analyticSphere::hitUnitSphere;
import package::lib::sphere::clip_from_local;

struct SpherePickUniforms {
  mvp: mat4x4<f32>,
  camPosLocal: vec3<f32>,
  packedId: u32,
};

// Visible to BOTH stages: the vertex stage reads 'mvp', the fragment reads all
// three. Bound with 'hasDynamicOffset: true' so each draw selects its slot.
@group(0) @binding(0) var<uniform> u: SpherePickUniforms;

// The one and ONLY '@builtin(position)'-bearing struct in this module. A second
// one linked alongside it passes both the build and the WESL linker and is
// rejected by 'createShaderModule' at runtime, which is why 'PickFSOut' below
// carries no position and the fragment reads it from here.
struct SpherePickVSOut {
  @builtin(position) clip: vec4<f32>,
  // Interpolated point on the circumscribing proxy shell, in the body's local
  // frame (body radii). A point on the view ray -- nothing more. It is NOT unit
  // length, so the fragment normalizes the difference from the ray origin.
  @location(0) localPos: vec3<f32>,
};

// Identity + analytic depth.
struct PickFSOut {
  @location(0) id: vec4<u32>,
  @builtin(frag_depth) depth: f32,
};

@vertex
fn vs(@location(0) position: vec3<f32>) -> SpherePickVSOut {
  var out: SpherePickVSOut;
  let proxy = position * PROXY_SCALE;
  out.clip = clip_from_local(u.mvp, proxy);
  out.localPos = proxy;
  return out;
}

@fragment
fn fsPick(in: SpherePickVSOut) -> PickFSOut {
  let ro = u.camPosLocal;
  // Renormalize AFTER interpolation: 'in.localPos' rides the scaled-up proxy, so
  // neither it nor its interpolant is unit length.
  let rd = normalize(in.localPos - ro);
  let surface = hitUnitSphere(ro, rd);
  // The missed lanes can go IMMEDIATELY here. The visual path has to carry them
  // as far as its 'dpdx'/'dpdy' calls, which demand uniform control flow; this
  // stage samples no texture, so it takes no derivatives and owes them nothing.
  if (!surface.hit) {
    discard;
  }

  var out: PickFSOut;
  // r-channel carries the identity; g/b/a stay 0 so the output is well-defined
  // (only the r channel is read back on the JS side).
  out.id = vec4<u32>(u.packedId, 0u, 0u, 0u);
  // The SAME mvp the vertex stage used, applied to the real surface point.
  out.depth = fragDepthFromLocal(u.mvp, surface.point);
  return out;
}
