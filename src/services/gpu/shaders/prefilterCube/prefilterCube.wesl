// prefilterCube.wesl -- one GGX-prefiltered texel of a probe cube: the lobe of
// roughness 'params.roughness' around the texel's direction, integrated over mip 0
// by GGX importance sampling with N = V = R (Karis 2013, split-sum). One draw
// per (mip, face); the covering triangle rasterises the whole face.

import package::lib::fullscreenTri::fullscreenVertex;
import package::lib::fullscreenTri::FullscreenOut;
import package::lib::math::TAU;

// Mirrors the 16-byte block 'prefilterCubeGgx.ts' writes per pass.
struct PrefilterParams {
  face: u32,
  roughness: f32,
  sampleCount: u32,
  _pad: u32,
};

// Binding 0 is a cube view pinned to mip 0: the pass writes a higher mip of
// the SAME texture, which is legal only while the two never share a subresource.
@group(0) @binding(0) var srcCube: texture_cube<f32>;
@group(0) @binding(1) var srcSampler: sampler;
@group(0) @binding(2) var<uniform> params: PrefilterParams;

@vertex
fn vs(@builtin(vertex_index) vertexIndex: u32) -> FullscreenOut {
  return fullscreenVertex(vertexIndex);
}

// The direction a face texel at (s, t) stands for under 'texture_cube'
// sampling (the GL/D3D major-axis table, inverted). t = 0 is the face's first
// row, where this pass's clip top lands: 'fullscreenVertex' flips uv.y for it.
// Writing texels by the same table the sampler reads them with is what makes
// mip k consistent with mip 0, whatever way the capture oriented the faces.
fn faceDirection(face: u32, faceUv: vec2<f32>) -> vec3<f32> {
  let faceX = faceUv.x * 2.0 - 1.0;
  let faceY = faceUv.y * 2.0 - 1.0;
  switch face {
    case 0u: { return vec3<f32>(1.0, -faceY, -faceX); }
    case 1u: { return vec3<f32>(-1.0, -faceY, faceX); }
    case 2u: { return vec3<f32>(faceX, 1.0, faceY); }
    case 3u: { return vec3<f32>(faceX, -1.0, -faceY); }
    case 4u: { return vec3<f32>(faceX, -faceY, 1.0); }
    default: { return vec3<f32>(-faceX, -faceY, -1.0); }
  }
}

// Hammersley point 'sampleIndex' of 'sampleCount': (sampleIndex / sampleCount,
// radical inverse base 2), the 2^-32 scale mapping the reversed bits into [0, 1).
fn hammersley(sampleIndex: u32, sampleCount: u32) -> vec2<f32> {
  return vec2<f32>(f32(sampleIndex) / f32(sampleCount), f32(reverseBits(sampleIndex)) * 2.3283064365386963e-10);
}

// A GGX half-vector in tangent space for linear roughness 'alpha'.
fn ggxHalfVector(samplePoint: vec2<f32>, alpha: f32) -> vec3<f32> {
  let phi = TAU * samplePoint.x;
  let cosTheta = sqrt((1.0 - samplePoint.y) / (1.0 + (alpha * alpha - 1.0) * samplePoint.y));
  let sinTheta = sqrt(1.0 - cosTheta * cosTheta);
  return vec3<f32>(sinTheta * cos(phi), sinTheta * sin(phi), cosTheta);
}

@fragment
fn fs(in: FullscreenOut) -> @location(0) vec4<f32> {
  let normal = normalize(faceDirection(params.face, in.uv));
  let viewDir = normal;
  let alpha = params.roughness * params.roughness;
  // Tangent frame around 'normal', hoisted out of the tap loop; the fallback axis
  // keeps the cross product off zero when 'normal' runs along +-Z.
  let up = select(vec3<f32>(1.0, 0.0, 0.0), vec3<f32>(0.0, 0.0, 1.0), abs(normal.z) < 0.999);
  let tangent = normalize(cross(up, normal));
  let bitangent = cross(normal, tangent);

  var sum = vec3<f32>(0.0);
  var weight = 0.0;
  for (var sampleIndex = 0u; sampleIndex < params.sampleCount; sampleIndex = sampleIndex + 1u) {
    let halfVectorTangent = ggxHalfVector(hammersley(sampleIndex, params.sampleCount), alpha);
    let halfVector = tangent * halfVectorTangent.x + bitangent * halfVectorTangent.y + normal * halfVectorTangent.z;
    let lightDir = 2.0 * dot(viewDir, halfVector) * halfVector - viewDir;
    let NoL = dot(normal, lightDir);
    if (NoL > 0.0) {
      sum = sum + textureSampleLevel(srcCube, srcSampler, lightDir, 0.0).rgb * NoL;
      weight = weight + NoL;
    }
  }
  return vec4<f32>(sum / max(weight, 1e-4), 1.0);
}
