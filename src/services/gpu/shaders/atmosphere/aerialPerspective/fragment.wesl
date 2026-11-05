// atmosphere/aerialPerspective/fragment.wesl — the inside-the-shell apply: one
// full-screen pass over the body the camera is inside, branching on the scene
// depth the foreground row stamped. A sky ray keeps the whole-column sky-view
// answer; a geometry ray reads 'bake.wesl''s froxel volume at its own
// depth-buffer distance — two samples, no march.

// Bindings 0-4 are the SHELL's, hoisted by importing 'sampleShellSegment';
// redeclaring any of them is a duplicate-binding error, and naming one hoisted
// without being imported ('skyViewLut') fails 'unresolved identifier' — hence
// the by-name imports of 'u' and 'lutSamp'.
import package::atmosphere::aerialPerspective::froxelSlices::froxelCoord;
import package::atmosphere::aerialPerspective::froxelSlices::froxelSliceStartKm;
import package::atmosphere::scattering::ScatteringParams;
import package::atmosphere::shell::fragment::lutSamp;
import package::atmosphere::shell::fragment::sampleShellSegment;
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

// Ratios of horizon distance to the froxel far bound, not km: whether the
// hard seam at the bound would land on visible terrain depends on the body's
// size and the bound together, and the ratio is exactly that comparison.
// Below START the seam is still below the horizon (nothing to fade); above
// END the shell alone reaches far enough to answer every visible pixel.
// Everest, 7 km up, ratio ~1.2 (8% shell); Mars, 73 km up, ratio ~2.8 (shell
// alone); Earth, 121 km up, shell alone.
const HANDOFF_HORIZON_START: f32 = 1.0;
const HANDOFF_HORIZON_END: f32 = 2.0;

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
    let s = sampleShellSegment(dir, 0.0, false);
    out.transmit = vec4<f32>(s.transmit, 1.0 - s.coverage);
    out.emission = vec4<f32>(s.emission, s.coverage);
    out.hit = s.hit;
    return out;
  }

  let tEnd = sceneRayDistance(in.uv, depth, u.invMvp, u.camPosLocal);
  let top = raySphere(u.camPosLocal, dir, PLANET_CENTER, 1.0);
  let tEndKm = tEnd * params.atmosphereTopKm;
  let boundKm = froxelSliceStartKm(textureDimensions(froxelInScatter).z, u.froxelSliceKm);

  // Same altitude every pixel this frame sees, but nothing in the bound
  // uniforms carries it as its own field: it is cheaper to re-derive from
  // 'u.camPosLocal'/'u.bottomRadius' per fragment than to grow the record for
  // one per-frame scalar. Below 'HANDOFF_HORIZON_START' the horizon is still
  // short of the froxel bound, so no ray can see the seam.
  let viewHeight = length(u.camPosLocal);
  let horizonKm = sqrt(max(viewHeight * viewHeight - u.bottomRadius * u.bottomRadius, 0.0)) *
    params.atmosphereTopKm;
  let shellWeight =
    smoothstep(HANDOFF_HORIZON_START, HANDOFF_HORIZON_END, horizonKm / boundKm);

  // Past the bound or past the top: the froxel volume is 32x32 texels across
  // the screen, so a column-dependent total there would blend across the limb
  // silhouette (task 13) — the shell's per-pixel segment is what the outside
  // limb already draws, so handing it this ray renders the inside limb like
  // the outside one. Weight 1: above 'HANDOFF_HORIZON_END' the horizon-reach
  // blend already says the shell alone reaches every geometry ray in frame,
  // so the froxel reads are skipped outright either way. 'tNear' is 0 inside
  // the shell, so the segment's front-body discard never fires on this path.
  if (tEndKm >= boundKm || tEnd >= top.y || shellWeight >= 1.0) {
    let s = sampleShellSegment(dir, tEnd, true);
    out.transmit = vec4<f32>(s.transmit, 1.0);
    out.emission = vec4<f32>(s.emission, 0.0);
    out.hit = s.hit;
    return out;
  }

  // The shell frame puts the atmosphere TOP at radius 1 and the volume is
  // indexed in km, so 'atmosphereTopKm' is the one scale between them. Below
  // one slice no texel exists, and 'identityMix' fades back to no medium.
  let c = froxelCoord(tEndKm, u.froxelSliceKm, textureDimensions(froxelInScatter).z);
  let p = vec3<f32>(in.uv, c.w);
  let inScatter =
    mix(textureSampleLevel(froxelInScatter, lutSamp, p, 0.0).rgb, vec3<f32>(0.0), c.identityMix);
  let transmittance =
    mix(textureSampleLevel(froxelTransmittance, lutSamp, p, 0.0).rgb, vec3<f32>(1.0), c.identityMix);

  var transmit = transmittance;
  var emission = inScatter * u.exposure;
  if (shellWeight > 0.0) {
    let s = sampleShellSegment(dir, tEnd, true);
    transmit = mix(transmit, s.transmit, shellWeight);
    emission = mix(emission, s.emission, shellWeight);
  }

  // Alpha passes through untouched (multiply by 1, add 0): opaque ground must
  // stay opaque for the compositor.
  out.transmit = vec4<f32>(transmit, 1.0);
  out.emission = vec4<f32>(emission, 0.0);
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
