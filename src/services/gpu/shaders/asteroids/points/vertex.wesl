// asteroids/points/vertex.wesl — one screen-sized dot per row the Kepler compute kept, read from its
// compacted 'visible' list by a drawIndirect, so the instance index is a list slot, not a catalog row.
// 'vs' draws, 'vsPick' stamps the pick target; both read the one list, so a row the screen doesn't
// show can never take a click (the cull itself is the compute's). Both drop a dot a body hides
// (lib/trailOcclusion's pointClearance); the pick has no scene depth of its own, so it binds the far
// placeholder and only the occluder spheres drop a stamp.
//
// The unit constants mirror SCALE_UNITS and MAIN_BELT the class's index in ASTEROID_CLASSES, pinned by
// asteroidPoints.parity.test.ts.

import package::asteroids::points::io::AsteroidUniforms;
import package::asteroids::points::io::VSOut;
import package::asteroids::points::io::PickOut;
import package::asteroids::lib::visibleTag::visibleTagRow;
import package::asteroids::lib::visibleTag::visibleTagClass;
import package::lib::camera::worldToClip;
import package::lib::billboard::triCorner;
import package::lib::billboard::expandBillboardScreen;
import package::lib::starPhotometry::starPeakIntensity;
import package::lib::starPhotometry::toRefPx;
import package::lib::trailOcclusion::pointClearance;

// Group 0 bindings 0-1 are lib/trailOcclusion's.
@group(0) @binding(2) var<uniform> params: AsteroidUniforms;
// Heliocentric xyz (AU) and lifted flux per kept dot, and its visibleTag.
@group(0) @binding(3) var<storage, read> visible: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read> visibleTags: array<u32>;
// The solver's rows, by catalog row: A = a·P̂ (AU) and e; M₀ bitcast, then the packed word.
@group(0) @binding(5) var<storage, read> elementsA: array<vec4<f32>>;
@group(0) @binding(6) var<storage, read> extra: array<vec2<u32>>;

const AU_KM: f32 = 149597870.7;
const MPC_TO_KM: f32 = 3.0856775814913673e19;
// Clip w is in near-plane units (near0OverlayClipScale), so this only drops a dot at or behind the eye.
const W_EPS: f32 = 0.01;
// Mid-range in either depth convention: the draw target is depthless, and in the pick every caption
// stamp (pinned at the near end) out-picks a dot it overlaps.
const MID_DEPTH: f32 = 0.5;
const MAIN_BELT: u32 = 1u;
// The Kirkwood gaps at Jupiter's 3:1 and 5:2 resonances, in a (AU): the belt's band seams.
const MIDDLE_BELT_AU: f32 = 2.5;
const OUTER_BELT_AU: f32 = 2.82;

struct AsteroidDot {
  relKm: vec3<f32>,
  flux: f32,
  cls: u32,
  row: u32,
};

fn asteroidDot(slot: u32) -> AsteroidDot {
  let entry = visible[slot];
  let tag = visibleTags[slot];
  let row = visibleTagRow(tag);
  var camRelAu = entry.xyz + params.sunFromCamAu;
  if (row == params.selectedRow) {
    camRelAu = params.selectedCamRelAu;
  }
  return AsteroidDot(camRelAu * AU_KM, entry.w, visibleTagClass(tag), row);
}

fn dotTint(asteroid: AsteroidDot) -> vec3<f32> {
  if (asteroid.cls != MAIN_BELT) {
    return params.classColor[asteroid.cls].rgb;
  }
  let aAu = length(elementsA[asteroid.row].xyz);
  return params.beltColor[u32(aAu >= MIDDLE_BELT_AU) + u32(aAu >= OUTER_BELT_AU)].rgb;
}

// A row with no H stores 65535, far fainter than any knee, so it keeps scale 1.
fn dotScale(asteroid: AsteroidDot) -> f32 {
  let hCenti = f32(extra[asteroid.row].y >> 16u);
  let knee = params.sizeKneeHCenti[asteroid.cls];
  let growth = saturate((knee - hCenti) / (knee - params.sizeFullHCenti));
  return 1.0 + (params.sizeMaxScale[asteroid.cls] - 1.0) * growth * growth;
}

@vertex
fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) slot: u32) -> VSOut {
  var out: VSOut; // zero-initialised: an early return is a degenerate, clipped vertex
  let asteroid = asteroidDot(slot);
  let centre = worldToClip(params.cam, asteroid.relKm / MPC_TO_KM);
  if (centre.w < W_EPS) {
    return out;
  }
  // Once per dot, not per fragment: a dot behind a body is dropped before it rasterises.
  let clear = pointClearance(asteroid.relKm, centre);
  if (clear <= 0.0) {
    return out;
  }
  let corner = triCorner(vid);
  let sizePx = params.sizePx[asteroid.cls];
  let offset = expandBillboardScreen(params.cam, centre, sizePx * dotScale(asteroid), corner);
  let fade = params.classColor[asteroid.cls].w * params.windowFade * clear;
  // The peak keeps the unscaled dot's, so a dot sized by H grows its light with its area: spread
  // over it at the same light, a landmark only blurred into the field.
  let peak = starPeakIntensity(1.0, asteroid.flux * fade, toRefPx(sizePx, params.cam.pxPerRad));
  out.clip = vec4<f32>(centre.xy + offset, MID_DEPTH * centre.w, centre.w);
  out.cornerKnee = vec3<f32>(corner, params.dotKnee[asteroid.cls]);
  out.tint = vec4<f32>(dotTint(asteroid) * params.thinGain, peak);
  return out;
}

@vertex
fn vsPick(@builtin(vertex_index) vid: u32, @builtin(instance_index) slot: u32) -> PickOut {
  var out: PickOut;
  let asteroid = asteroidDot(slot);
  let centre = worldToClip(params.cam, asteroid.relKm / MPC_TO_KM);
  if (centre.w < W_EPS || pointClearance(asteroid.relKm, centre) < 0.5) {
    return out;
  }
  let corner = triCorner(vid);
  let offset = expandBillboardScreen(params.cam, centre, params.sizePx[asteroid.cls], corner);
  out.clip = vec4<f32>(centre.xy + offset, MID_DEPTH * centre.w, centre.w);
  out.corner = corner;
  out.word = params.pickBase + asteroid.row;
  return out;
}
