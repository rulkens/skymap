// texturedBody/impostorVertex.wesl — vertex stage for the SPIKE analytic
// ray-traced sphere ('?impostor').
//
// Reuses the SAME vertex buffers as the mesh path ('uvSphereMesh(48, 24)':
// position at @location(0), uv at @location(1)) so the renderer swaps only the
// two shader modules and the cull mode -- no second geometry upload.
//
// ## The proxy is scaled up, and its BACK faces are drawn
//
// The tessellated sphere's silhouette is a polygon INSCRIBED in the true circle,
// short of it by '1 - cos(half-step)' -- 0.214% of the radius at 48x24 (see
// 'sphereTessellation.ts'). If the proxy were drawn at unit radius its outline
// would clip the analytic sphere it is supposed to reveal, shaving exactly the
// limb pixels this spike exists to recover. Scaling the proxy by PROXY_SCALE
// makes it strictly CIRCUMSCRIBE the true sphere: 1.05 * cos(3.75 deg) = 1.0478,
// comfortably outside 1.0, and the disc it projects strictly contains the true
// sphere's disc for any camera distance.
//
// The renderer pairs this with 'cullMode: front', so the FAR hemisphere of the
// proxy is what rasterises. Front faces would vanish the moment the camera
// crossed inside the 1.05 shell (a legal close approach -- 5% of a body radius
// above the surface) and the body would disappear. Back faces still cover the
// whole disc from inside the shell, because from in there the near hemisphere is
// behind the eye and the far hemisphere fills the view.
//
// The proxy is never itself visible: every fragment either hits the analytic
// unit sphere or discards. Its depth is never used either -- the fragment writes
// '@builtin(frag_depth)' from the analytic hit point.
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'TexturedBodyUniforms' (112 bytes) exactly as
// the mesh path does; this stage reads only 'u.mvp'. The declaration is
// module-local (WESL has no global state), so 'u' is redeclared here and
// 'u.mvp' passed into 'clip_from_local' -- the 'pass cam, don't capture' idiom.

import package::bodies::texturedBody::impostorIo::ImpostorVSOut;
import package::lib::sphere::TexturedBodyUniforms;
import package::lib::sphere::clip_from_local;

@group(0) @binding(0) var<uniform> u: TexturedBodyUniforms;

// Radial blow-up of the proxy shell, in body radii. Must exceed the
// tessellation's inscribed-silhouette deficit (0.214% at 48x24) by a healthy
// margin; 5% is cheap because the proxy is never shaded, only rasterised.
const PROXY_SCALE: f32 = 1.05;

@vertex
fn vs(@location(0) position: vec3<f32>, @location(1) uv: vec2<f32>) -> ImpostorVSOut {
  var out: ImpostorVSOut;
  // The mesh uv is bound (the renderer reuses the mesh path's vertex buffers)
  // but unread: the impostor derives its uv per fragment from the analytic hit.
  let proxy = position * PROXY_SCALE;
  out.clip = clip_from_local(u.mvp, proxy);
  out.localPos = proxy;
  return out;
}
