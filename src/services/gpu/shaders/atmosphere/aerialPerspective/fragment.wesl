// atmosphere/aerialPerspective/fragment.wesl — the inside-the-shell apply: one
// full-screen pass over the body the camera is inside, branching on the scene
// depth the foreground row stamped. A sky ray keeps the whole-column sky-view
// answer; a geometry ray reads 'bake.wesl''s froxel volume at its own
// depth-buffer distance — two samples, no march.

// Bindings 0-4 are the SHELL's, hoisted by importing 'sampleShellRay';
// redeclaring any of them is a duplicate-binding error, and naming one hoisted
// without being imported ('skyViewLut') fails 'unresolved identifier' — hence
// the by-name imports of 'u' and 'lutSamp'.
import package::atmosphere::aerialPerspective::froxelSlices::froxelCoord;
import package::atmosphere::scattering::ScatteringParams;
import package::atmosphere::shell::fragment::lutSamp;
import package::atmosphere::shell::fragment::sampleShellRay;
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

@group(0) @binding(5) var<uniform> params: ScatteringParams;
@group(0) @binding(6) var froxelInScatter: texture_3d<f32>;
@group(0) @binding(7) var froxelTransmittance: texture_3d<f32>;
// No depth ATTACHMENT on this pass: WebGPU forbids sampling a view attached to
// the same pass, and this is the only shape that can read scene depth here.
@group(0) @binding(8) var sceneDepth: texture_depth_2d;

const PLANET_CENTER = vec3<f32>(0.0, 0.0, 0.0);

// Both blend passes' contributions from ONE evaluation, so the pair can never
// disagree about which branch a pixel took.
struct AerialSample {
  // The MULTIPLY pass's output: rgb scales the target per channel, alpha with it.
  transmit: vec4<f32>,
  emission: vec4<f32>,
  hit: bool,
};

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

  // GEOMETRY — cut at the depth sample, and at the atmosphere top for anything
  // beyond it (a mesh in orbit, a farther body): past the top there is no
  // medium left, so the exit IS the answer.
  var tEnd = sceneRayDistance(in.uv, depth, u.invMvp, u.camPosLocal);
  let top = raySphere(u.camPosLocal, dir, PLANET_CENTER, 1.0);
  if (top.y >= 0.0) {
    tEnd = min(tEnd, top.y);
  }

  // The shell frame puts the atmosphere TOP at radius 1 and the volume is
  // indexed in km, so 'atmosphereTopKm' is the one scale between them. Below
  // one slice no texel exists, and 'identityMix' fades back to no medium.
  let c = froxelCoord(tEnd * params.atmosphereTopKm, u.froxelSliceKm,
                      textureDimensions(froxelInScatter).z);
  let p = vec3<f32>(in.uv, c.w);
  let inScatter =
    mix(textureSampleLevel(froxelInScatter, lutSamp, p, 0.0).rgb, vec3<f32>(0.0), c.identityMix);
  let transmittance =
    mix(textureSampleLevel(froxelTransmittance, lutSamp, p, 0.0).rgb, vec3<f32>(1.0), c.identityMix);

  // Alpha passes through untouched (multiply by 1, add 0): opaque ground must
  // stay opaque for the compositor.
  out.transmit = vec4<f32>(transmittance, 1.0);
  out.emission = vec4<f32>(inScatter * u.exposure, 0.0);
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
