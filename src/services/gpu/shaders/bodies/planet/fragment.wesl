// planet/fragment.wesl — flat-lit albedo over a RAY-TRACED sphere.
//
// The rasterised triangles are a circumscribing proxy, not the body. Each
// fragment casts a ray from the camera through its own proxy position and
// intersects the analytic unit sphere; the normal and the depth come from that
// hit. So the silhouette is a pixel-exact circle at the SAME radius the
// atmosphere shell rays against ('bottomRadius' in 'packAtmosphereUniforms'),
// not a 48-gon inscribed 0.2-0.4% inside it whose sliver leaks background along
// the limb where the glow is brightest. The sphere maths -- and why the depth
// carries no reversed-Z flip -- live in 'lib/analyticSphere.wesl'.
//
// Shading stays one dot product: the shared 'litShade' against the per-instance
// 'sunDirLocal' (the Sun rotated into the body's local frame CPU-side, so one
// instanced draw still gives every planet its own terminator) plus that
// function's AMBIENT floor, which keeps the night hemisphere from dissolving
// into the black background. Output is straight alpha=1 into the opaque
// rgba16float foreground target.
//
// Two costs worth naming. Writing '@builtin(frag_depth)' disables early-Z for
// this pipeline -- unavoidable, since the rasterised depth belongs to the proxy
// and is nowhere near the surface, and the same price 'texturedBodyRenderer'
// already pays. And nothing here samples a texture, so unlike
// 'texturedBody/fragment.wesl' there are no derivatives owed uniform control
// flow: a missed lane can 'discard' immediately.

import package::bodies::planet::io::VSOut;
import package::lib::analyticSphere::fragDepthFromLocal;
import package::lib::analyticSphere::hitUnitSphere;
import package::lib::bodyLighting::litShade;

// Colour + analytic depth. No '@builtin(position)' here -- the entry point's
// position arrives through 'VSOut', and two position-bearing structs in one
// linked module is rejected at 'createShaderModule' having passed both the
// build and the WESL linker.
struct FSOut {
  @location(0) colour: vec4<f32>,
  @builtin(frag_depth) depth: f32,
};

@fragment
fn fs(in: VSOut) -> FSOut {
  let ro = in.camPosLocal;
  // Renormalize AFTER interpolation: 'in.localPos' rides the PROXY_SCALE-scaled
  // shell, so neither it nor its interpolant is unit length.
  let rd = normalize(in.localPos - ro);
  let surface = hitUnitSphere(ro, rd);
  if (!surface.hit) {
    discard;
  }

  // Unit length by construction, so it is the exact geometric normal -- no
  // barycentric blend, and co-framed with 'sunDirLocal'.
  let n = surface.point;
  let shade = litShade(n, in.sunDirLocal);

  var out: FSOut;
  out.colour = vec4<f32>(in.albedo * shade, 1.0);
  // The SAME mvp the vertex stage used, applied to the real surface point.
  out.depth = fragDepthFromLocal(mat4x4<f32>(in.mvp0, in.mvp1, in.mvp2, in.mvp3), n);
  return out;
}
