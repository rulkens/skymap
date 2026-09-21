// atmosphere/aerialPerspective/fragment.wesl — the inside-the-shell apply: one
// full-screen pass over the body the camera is inside, branching on the scene
// depth the foreground row stamped. A sky ray keeps the whole-column sky-view
// answer; a geometry ray MARCHES the shared integrand from the camera to its
// own depth-buffer hit (SPIKE: #709 read a baked 32^3 froxel volume here
// instead — this variant trades that bake for a per-pixel march).
//
// Bindings 0-4 are the SHELL's, hoisted by importing 'sampleShellRay';
// declaring any of them here again is a duplicate-binding error, and NAMING
// one that was hoisted without being imported ('skyViewLut') fails
// 'unresolved identifier'. Hence the by-name imports of 'u' and 'lutSamp'.
//
// Units: the shell frame has the atmosphere TOP at radius 1, while
// 'scatterStep' works in km. 'params.atmosphereTopKm' is the one scale between
// them, applied to the ray origin and to every step length.

import package::atmosphere::scattering::ScatteringParams;
import package::atmosphere::scattering::scatterStep;
import package::atmosphere::shell::fragment::lutSamp;
import package::atmosphere::shell::fragment::sampleShellRay;
import package::atmosphere::shell::fragment::transmittanceLut;
import package::atmosphere::shell::fragment::u;
import package::lib::fullscreenTri::FullscreenOut;
import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::sceneDepthRay::FAR_DEPTH;
import package::lib::sceneDepthRay::sceneRayDir;
import package::lib::sceneDepthRay::sceneRayDistance;
import package::lib::util::raySphere;

// The covering triangle. Declared here rather than imported because the linker
// does not preserve an imported entry point's NAME for the pipeline's lookup
// ('lib/fullscreenTri.wesl').
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> FullscreenOut {
  return fullscreenVertex(vi);
}

// The twilight knobs ride the per-frame sky-view params buffer (live Settings
// sliders). Restated here rather than imported from 'skyViewLut.wesl': that
// module owns its own '@group(0)' declarations and importing through it would
// hoist a second, conflicting set.
struct SkyViewParams {
  viewHeightKm: f32,
  sunZenithCos: f32,
  twilightSoftness: f32,
  twilightIntensity: f32,
};

@group(0) @binding(5) var multiScatterLut: texture_2d<f32>;
@group(0) @binding(6) var<uniform> params: ScatteringParams;
@group(0) @binding(7) var<uniform> view: SkyViewParams;
// No depth ATTACHMENT on this pass: WebGPU forbids sampling a view attached to
// the same pass, and this is the only shape that can read scene depth here.
@group(0) @binding(8) var sceneDepth: texture_depth_2d;

// The only quality knob. Fixed-step quadrature like the sky-view bake's 30.
const AERIAL_STEPS: f32 = 16.0;

const PLANET_CENTER = vec3<f32>(0.0, 0.0, 0.0);

// Both blend passes' contributions from ONE evaluation, so the pair can never
// disagree about which branch a pixel took.
struct AerialSample {
  // The MULTIPLY pass's output: rgb scales the target per channel, alpha with it.
  transmit: vec4<f32>,
  emission: vec4<f32>,
  hit: bool,
};

// The geometry branch: march [0, tEnd] in shell-local units, converting to km
// for the shared integrand. Returns the accumulated in-scatter in 'inScatter'
// and the segment's per-channel throughput in 'transmittance'.
struct AerialMarch {
  inScatter: vec3<f32>,
  transmittance: vec3<f32>,
};

fn marchAerial(dir: vec3<f32>, tEnd: f32) -> AerialMarch {
  var out: AerialMarch;
  out.inScatter = vec3<f32>(0.0);
  out.transmittance = vec3<f32>(1.0);

  let topKm = params.atmosphereTopKm;
  let p0 = u.camPosLocal * topKm;
  let dtKm = (tEnd * topKm) / AERIAL_STEPS;
  if (dtKm <= 0.0) {
    return out;
  }
  let cosTheta = dot(dir, u.sunDirLocal);

  var i: u32 = 0u;
  loop {
    if (f32(i) >= AERIAL_STEPS) { break; }
    let pos = p0 + dir * ((f32(i) + 0.5) * dtKm);
    let s = scatterStep(
      params, transmittanceLut, multiScatterLut, lutSamp,
      pos, u.sunDirLocal, cosTheta, dtKm,
      view.twilightSoftness, view.twilightIntensity,
    );
    out.inScatter = out.inScatter + out.transmittance * s.inScatter;
    out.transmittance = out.transmittance * s.transmittance;
    i = i + 1u;
  }
  return out;
}

fn aerialSample(in: FullscreenOut) -> AerialSample {
  var out: AerialSample;
  let depth = textureLoad(sceneDepth, vec2<i32>(in.pos.xy), 0);
  let dir = sceneRayDir(in.uv, u.invMvp, u.camPosLocal);

  if (depth == FAR_DEPTH) {
    // SKY — today's shell answer, with its alpha semantics untouched: the star
    // and deep-space washout the compositor derives from 'foreground:0's alpha
    // is exactly what the multiply/add pair wrote before this pass existed.
    let s = sampleShellRay(dir);
    out.transmit = vec4<f32>(s.transmit, 1.0 - s.coverage);
    out.emission = vec4<f32>(s.emission, s.coverage);
    out.hit = s.hit;
    return out;
  }

  // GEOMETRY — cut the march at the depth sample, and at the atmosphere top
  // for anything beyond it (a mesh in orbit, a farther body): past the top
  // there is no medium left to integrate, so the exit IS the answer.
  var tEnd = sceneRayDistance(in.uv, depth, u.invMvp, u.camPosLocal);
  let top = raySphere(u.camPosLocal, dir, PLANET_CENTER, 1.0);
  if (top.y >= 0.0) {
    tEnd = min(tEnd, top.y);
  }
  let m = marchAerial(dir, tEnd);

  // Alpha passes through untouched (multiply by 1, add 0): opaque ground must
  // stay opaque for the compositor.
  out.transmit = vec4<f32>(m.transmittance, 1.0);
  out.emission = vec4<f32>(m.inScatter * u.exposure, 0.0);
  out.hit = true;
  return out;
}

@fragment
fn fsAerialMultiply(in: FullscreenOut) -> @location(0) vec4<f32> {
  let s = aerialSample(in);
  if (!s.hit) {
    discard;
  }
  return s.transmit;
}

@fragment
fn fsAerialAdd(in: FullscreenOut) -> @location(0) vec4<f32> {
  let s = aerialSample(in);
  if (!s.hit) {
    discard;
  }
  return s.emission;
}
