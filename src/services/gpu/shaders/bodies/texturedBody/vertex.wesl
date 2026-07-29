// texturedBody/vertex.wesl — vertex stage for a textured planet or moon.
//
// Rasterises 'uvSphereMesh(48, 24)' (position at @location(0), uv at
// @location(1)) not as the body's surface but as a coarse PROXY shell that
// circumscribes it: the fragment recovers the real surface per pixel from a
// ray-sphere test, so all this stage owes it is a point on each fragment's view
// ray. The mesh is shared with 'bodyPickRenderer' and the two mesh renderers --
// 'sphereTessellation.ts' is its single home.
//
// ## The proxy is scaled up, and its BACK faces are drawn
//
// A tessellated sphere's silhouette is a polygon INSCRIBED in the true circle,
// short of it by '1 - cos(half-step)'. Drawn at unit radius the proxy's own
// outline would therefore clip the analytic sphere it exists to reveal, shaving
// exactly the limb pixels this path recovers. 'PROXY_SCALE' inflates it until it
// strictly CIRCUMSCRIBES the true sphere at every camera distance; the deficit
// arithmetic and the 5% margin live with the constant in
// 'lib/analyticSphere.wesl'.
//
// The renderer pairs this with 'cullMode: front', so the FAR hemisphere of the
// proxy is what rasterises. Front faces would vanish the moment the camera
// crossed inside the shell (a legal close approach -- 5% of a body radius above
// the surface) and the body would disappear. Back faces still cover the whole
// disc from inside the shell, because from in there the near hemisphere is
// behind the eye and the far hemisphere fills the view.
//
// The proxy is never itself visible: every fragment either hits the analytic
// unit sphere or discards. Its depth is never used either -- the fragment writes
// '@builtin(frag_depth)' from the analytic hit point.
//
// ## Bindings
//
// '@group(0) @binding(0)' holds 'TexturedBodyUniforms' (112 bytes), visible in
// both stages; this one reads only 'u.mvp'. The declaration is module-local
// (WESL has no global state), so 'u' is redeclared here and 'u.mvp' passed into
// 'clip_from_local' -- the 'pass cam, don't capture' idiom.

import package::bodies::texturedBody::io::TexturedBodyVSOut;
import package::lib::analyticSphere::PROXY_SCALE;
import package::lib::sphere::TexturedBodyUniforms;
import package::lib::sphere::clip_from_local;

@group(0) @binding(0) var<uniform> u: TexturedBodyUniforms;

@vertex
fn vs(@location(0) position: vec3<f32>, @location(1) uv: vec2<f32>) -> TexturedBodyVSOut {
  var out: TexturedBodyVSOut;
  // The mesh uv is bound (one vertex-buffer layout serves every consumer of this
  // mesh) but unread: the uv is derived per fragment from the analytic hit.
  let proxy = position * PROXY_SCALE;
  out.clip = clip_from_local(u.mvp, proxy);
  out.localPos = proxy;
  return out;
}
