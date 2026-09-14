// atmosphere/aerialPerspective/fragment.wesl — the froxel apply. One
// full-screen pass over the body the camera is inside, branching per pixel on
// the scene depth the foreground row already stamped: a sky ray keeps the
// whole-column sky-view answer, a geometry ray reads the volume at its own
// distance ('froxelLut.wesl' baked it along this same ray).
//
// Bindings 0-4 are the SHELL's, imported rather than redeclared, so one bind
// group serves both halves: 'u' and 'lutSamp' by name, the three LUT/ring
// textures implicitly with 'sampleShellRay'. Comments single-quoted, never
// backticks. Literal 'package::' imports.

import package::atmosphere::froxelSlices::froxelMaxDistance;
import package::atmosphere::froxelSlices::froxelRayDir;
import package::atmosphere::froxelSlices::froxelRayDistance;
import package::atmosphere::froxelSlices::froxelSliceCoord;
import package::atmosphere::shell::fragment::lutSamp;
import package::atmosphere::shell::fragment::sampleShellRay;
import package::atmosphere::shell::fragment::u;
import package::lib::fullscreenTri::FullscreenOut;

@group(0) @binding(5) var froxelInScatter: texture_3d<f32>;
@group(0) @binding(6) var froxelTransmittance: texture_3d<f32>;
// No depth ATTACHMENT on this pass: WebGPU forbids sampling a view attached to
// the same pass, and this is the only shape that can read scene depth here.
@group(0) @binding(7) var sceneDepth: texture_depth_2d;

// The body slab's reversed-Z far-plane clear value; its CPU twin is
// 'depthClearValueFor(SLAB_REVERSED_Z[NEAR0])'. A texel still holding it has no
// geometry in front of it.
const FAR_DEPTH: f32 = 0.0;

// Both blend passes' contributions from ONE evaluation, so the pair can never
// disagree about which branch a pixel took.
struct AerialSample {
  // The MULTIPLY pass's output: rgb scales the target per channel, alpha with it.
  transmit: vec4<f32>,
  // The ADD pass's output.
  emission: vec4<f32>,
  hit: bool,
};

fn aerialSample(in: FullscreenOut) -> AerialSample {
  var out: AerialSample;
  let depth = textureLoad(sceneDepth, vec2<i32>(in.pos.xy), 0);

  if (depth == FAR_DEPTH) {
    // SKY — today's shell answer, with its alpha semantics untouched: the star
    // and deep-space washout the compositor derives from 'foreground:0's alpha
    // is exactly what the multiply/add pair wrote before this pass existed.
    let s = sampleShellRay(froxelRayDir(u.invMvp, u.camPosLocal, in.uv));
    out.transmit = vec4<f32>(s.transmit, 1.0 - s.coverage);
    out.emission = vec4<f32>(s.emission, s.coverage);
    out.hit = s.hit;
    return out;
  }

  // GEOMETRY — the same ray the bake walked, now cut at the depth sample.
  // Alpha passes through untouched (multiply by 1, add 0): opaque ground must
  // stay opaque for the compositor.
  let sliceCount = f32(textureDimensions(froxelInScatter).z);
  let maxDistance = froxelMaxDistance(length(u.camPosLocal), u.bottomRadius);
  let hitDistance = froxelRayDistance(u.invMvp, u.camPosLocal, in.uv, depth);
  let uvw = vec3<f32>(in.uv, froxelSliceCoord(hitDistance, sliceCount, maxDistance));
  out.transmit = vec4<f32>(textureSampleLevel(froxelTransmittance, lutSamp, uvw, 0.0).rgb, 1.0);
  out.emission = vec4<f32>(
    textureSampleLevel(froxelInScatter, lutSamp, uvw, 0.0).rgb * u.exposure,
    0.0,
  );
  out.hit = true;
  return out;
}

// MULTIPLY strictly BEFORE ADD (the renderer pairs them in that order): the
// multiply pass scales whatever is already in the target, so running it second
// would attenuate this pass's own in-scatter by its own transmittance.
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
