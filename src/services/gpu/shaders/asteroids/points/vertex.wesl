// asteroids/points/vertex.wesl — one screen-sized dot per catalog row, placed by the Kepler compute's
// helio buffer. 'vs' draws, 'vsPick' stamps the pick target; both go through 'asteroidDot', so a row
// the screen doesn't show can never take a click.
//
// The constants mirror the TS tables (ASTEROID_PHOTOMETRY, ASTEROID_FORMAT, ASTEROID_HIDDEN_FLAG,
// SCALE_UNITS), pinned by asteroidPoints.parity.test.ts.

import package::asteroids::points::io::AsteroidUniforms;
import package::asteroids::points::io::VSOut;
import package::asteroids::points::io::PickOut;
import package::asteroids::lib::apparentMagnitude::asteroidApparentMagnitude;
import package::lib::camera::worldToClip;
import package::lib::billboard::triCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::starPhotometry::starPeakIntensity;
import package::lib::starPhotometry::toRefPx;

@group(0) @binding(2) var<uniform> u: AsteroidUniforms;
@group(0) @binding(3) var<storage, read> helio: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> extra: array<vec2<u32>>;

const NO_H_MAGNITUDE: f32 = 21.0;
const MIN_FLUX: f32 = 3.981071705534969e-7;
const MIN_DELTA_AU: f32 = 0.001;
const CLASS_MASK: u32 = 7u;
const HIDDEN_FLAG: u32 = 128u;
const H_NONE: u32 = 65535u;
const H_OFFSET: f32 = 5.0;
const H_SCALE: f32 = 100.0;
const G_OFFSET: f32 = 0.5;
const G_SCALE: f32 = 100.0;
const AU_KM: f32 = 149597870.7;
const MPC_TO_KM: f32 = 3.0856775814913673e19;
const LAST_CLASS: u32 = 4u;
// Clip w is in near-plane units (near0OverlayClipScale), so this only drops a dot at or behind the eye.
const W_EPS: f32 = 0.01;
// Mid-range in either depth convention: the draw target is depthless, and in the pick every caption
// stamp (pinned at the near end) out-picks a dot it overlaps.
const MID_DEPTH: f32 = 0.5;

struct AsteroidDot {
  relKm: vec3<f32>,
  // Lifted by 'exposure'; 0 for a culled row.
  flux: f32,
  cls: u32,
};

// THE cull, shared by draw and pick: class faded out, hidden (meshed or absent), or under the flux floor.
fn asteroidDot(row: u32) -> AsteroidDot {
  var culled: AsteroidDot;
  let packed = extra[row].y;
  let cls = min(packed & CLASS_MASK, LAST_CLASS);
  if ((packed & HIDDEN_FLAG) != 0u || u.classColor[cls].w <= 0.0) {
    return culled;
  }
  let h = helio[row];
  var camRelAu = h.xyz + u.sunFromCamAu;
  if (row == u.selectedRow) {
    camRelAu = u.selectedCamRelAu;
  }
  let hCenti = packed >> 16u;
  var v = NO_H_MAGNITUDE;
  if (hCenti != H_NONE) {
    let deltaAu = max(length(camRelAu), MIN_DELTA_AU);
    let hMag = f32(hCenti) / H_SCALE - H_OFFSET;
    let g = f32((packed >> 8u) & 255u) / G_SCALE - G_OFFSET;
    let cosPhase = dot(h.xyz, camRelAu) / max(h.w * deltaAu, 1e-30);
    v = asteroidApparentMagnitude(hMag, g, h.w, deltaAu, cosPhase);
  }
  let flux = pow(10.0, -0.4 * v) * u.exposure;
  if (flux < MIN_FLUX) {
    return culled;
  }
  return AsteroidDot(camRelAu * AU_KM, flux, cls);
}

@vertex
fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) row: u32) -> VSOut {
  var out: VSOut; // zero-initialised: an early return is a degenerate, clipped vertex
  let d = asteroidDot(row);
  let centre = worldToClip(u.cam, d.relKm / MPC_TO_KM);
  if (d.flux <= 0.0 || centre.w < W_EPS) {
    return out;
  }
  let corner = triCorner(vid);
  let offset = expandBillboardScreen(u.cam, centre, u.sizePx, corner);
  let fade = u.classColor[d.cls].w * u.windowFade;
  let peak = starPeakIntensity(1.0, d.flux * fade, toRefPx(u.sizePx, u.cam.pxPerRad));
  out.clip = vec4<f32>(centre.xy + offset, MID_DEPTH * centre.w, centre.w);
  out.relKm = d.relKm;
  out.corner = corner;
  out.tint = vec4<f32>(u.classColor[d.cls].rgb, peak);
  return out;
}

@vertex
fn vsPick(@builtin(vertex_index) vid: u32, @builtin(instance_index) row: u32) -> PickOut {
  var out: PickOut;
  let d = asteroidDot(row);
  let centre = worldToClip(u.cam, d.relKm / MPC_TO_KM);
  if (d.flux <= 0.0 || centre.w < W_EPS) {
    return out;
  }
  let corner = triCorner(vid);
  let offset = expandBillboardScreen(u.cam, centre, u.sizePx, corner);
  out.clip = vec4<f32>(centre.xy + offset, MID_DEPTH * centre.w, centre.w);
  out.relKm = d.relKm;
  out.corner = corner;
  out.word = u.pickBase + row;
  return out;
}
