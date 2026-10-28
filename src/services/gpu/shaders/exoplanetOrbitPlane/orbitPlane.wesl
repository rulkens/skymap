// exoplanetOrbitPlane/orbitPlane.wesl — a planetary system's orbits and
// habitable zone, drawn where each pixel's view ray meets the system's
// orbital plane, so the circles turn into ellipses as the camera tilts.
// Positions are in au relative to the eye, written by the CPU in f64, so
// nothing large reaches f32. Lines stay ~1 px wide through the screen-space
// derivative of the in-plane radius. Layout mirrors exoplanetOrbitPlaneRenderer.ts.
import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;

struct Uniforms {
  camForward: vec3<f32>,
  tanHalfFovY: f32,
  camRight: vec3<f32>,
  aspect: f32,
  camUp: vec3<f32>,
  alpha: f32,
  hostRelEye: vec3<f32>,
  orbitCount: f32,
  u: vec3<f32>,
  zoneInner: f32,
  v: vec3<f32>,
  zoneOuter: f32,
  orbits: array<vec4<f32>, 2>,
};

@group(0) @binding(0) var<uniform> uni: Uniforms;

const LINE_PX: f32 = 0.75;
const ORBIT_RGB: vec3<f32> = vec3<f32>(0.8, 0.85, 1.0);
const ZONE_RGB: vec3<f32> = vec3<f32>(0.3, 0.95, 0.55);
const ORBIT_GAIN: f32 = 0.5;
const ZONE_EDGE_GAIN: f32 = 0.6;
const ZONE_FILL_GAIN: f32 = 0.06;
// Seen edge-on the plane collapses to a line and the derivatives blow up;
// fade it out over the last few degrees instead of smearing.
const GRAZING: vec2<f32> = vec2<f32>(0.02, 0.08);

fn lineCoverage(offset: f32, px: f32) -> f32 {
  return 1.0 - smoothstep(LINE_PX * px, (LINE_PX + 1.0) * px, offset);
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

@fragment
fn fs(input: FullscreenOut) -> @location(0) vec4<f32> {
  let ndc = vec2<f32>(input.uv.x * 2.0 - 1.0, 1.0 - input.uv.y * 2.0);
  let ray = normalize(
    uni.camForward
    + ndc.x * uni.tanHalfFovY * uni.aspect * uni.camRight
    + ndc.y * uni.tanHalfFovY * uni.camUp,
  );
  let n = cross(uni.u, uni.v);
  let rn = dot(ray, n);
  let safeRn = select(rn, 1e-6, abs(rn) < 1e-6);
  let t = dot(uni.hostRelEye, n) / safeRn;
  let p = t * ray - uni.hostRelEye;
  let r = length(vec2<f32>(dot(p, uni.u), dot(p, uni.v)));
  let px = fwidth(r);

  var orbit = 0.0;
  for (var i = 0u; i < 8u; i++) {
    if (f32(i) < uni.orbitCount) {
      orbit = max(orbit, lineCoverage(abs(r - uni.orbits[i / 4u][i % 4u]), px));
    }
  }
  var zone = 0.0;
  if (uni.zoneOuter > 0.0) {
    let edges = max(
      lineCoverage(abs(r - uni.zoneInner), px),
      lineCoverage(abs(r - uni.zoneOuter), px),
    );
    let fill = smoothstep(uni.zoneInner - px, uni.zoneInner + px, r)
      * (1.0 - smoothstep(uni.zoneOuter - px, uni.zoneOuter + px, r));
    zone = edges * ZONE_EDGE_GAIN + fill * ZONE_FILL_GAIN;
  }
  let rgb = ORBIT_RGB * orbit * ORBIT_GAIN + ZONE_RGB * zone;
  let visible = t > 0.0 && t < 1e30;
  let weight = uni.alpha * smoothstep(GRAZING.x, GRAZING.y, abs(rn));
  // select, not a multiply: a ray parallel to the plane leaves NaN in rgb.
  return vec4<f32>(select(vec3<f32>(0.0), rgb * weight, visible), 0.0);
}
