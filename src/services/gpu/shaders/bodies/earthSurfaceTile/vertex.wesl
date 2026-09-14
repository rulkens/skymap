// earthSurfaceTile/vertex.wesl — every patch's geometry from nothing but a
// 64-byte 'PatchInstance' and the two draw builtins: '@builtin(instance_index)'
// picks the patch, '@builtin(vertex_index)' is the shared template's vertex id
// (under an indexed draw that builtin carries the INDEX BUFFER's value), split
// into (i, j) over the (n+1)^2 grid by 'u.meshResolution'.
//
// 'patchVertexOffset' is the twin of src/utils/scene/patchVertexOffsetM.ts --
// same names, same order, changed together; the f64 ground truth is tested
// there. 'originRelEyeM' was differenced in f64 CPU-side from the SAME
// f32-rounded anchor read here, so s = t = 0 lands on it exactly: no cracks.
// The record is 'inst', never 'patch' -- 'patch' is a WGSL RESERVED WORD.

import package::bodies::earthSurfaceTile::io::VSOut;
import package::bodies::earthSurfaceTile::io::PatchInstance;
import package::bodies::earthSurfaceTile::io::SurfaceTileUniforms;

@group(0) @binding(0) var<uniform> u: SurfaceTileUniforms;
@group(0) @binding(1) var<storage, read> patches: array<PatchInstance>;

// Offset from the patch's origin corner, in the body's fixed axes, metres.
// '2*sin^2(x/2)' is algebraically '1 - cos x' and NOT interchangeable with it:
// at a z19 patch's dlon of 1.2e-5 rad, '1 - cos' cancels away every
// significant f32 bit while this form keeps them all. Do not 'simplify' it.
fn patchVertexOffset(anchor: PatchInstance, radiusM: f32, s: f32, t: f32) -> vec3<f32> {
  let lon0Rad = anchor.lon0Rad;
  let lat0Rad = anchor.lat0Rad;
  let dlon = s * anchor.dLonRad;
  let dlat = t * anchor.dLatRad;
  let lat = lat0Rad + dlat;

  let sinHalfLon = sin(dlon / 2.0);
  let sinHalfLat = sin(dlat / 2.0);
  let havLon = 2.0 * sinHalfLon * sinHalfLon;
  let havLat = 2.0 * sinHalfLat * sinHalfLat;
  let cosLat = cos(lat);
  let cE = cosLat * sin(dlon);
  let cN = sin(dlat) + cosLat * sin(lat0Rad) * havLon;
  let cU = -havLat - cosLat * cos(lat0Rad) * havLon;

  let xE = radiusM * cE;
  let xN = radiusM * cN;
  let xU = radiusM * cU;

  // The ENU frame at (lon0, lat0) in the body's fixed axes -- +Z the pole,
  // longitude 0 on +X, the convention 'equirectUvToDirection' fixes.
  let sinLon0 = sin(lon0Rad);
  let cosLon0 = cos(lon0Rad);
  let sinLat0 = sin(lat0Rad);
  let cosLat0 = cos(lat0Rad);
  return vec3<f32>(
    xE * -sinLon0 + xN * -(sinLat0 * cosLon0) + xU * (cosLat0 * cosLon0),
    xE * cosLon0 + xN * -(sinLat0 * sinLon0) + xU * (cosLat0 * sinLon0),
    xN * cosLat0 + xU * sinLat0,
  );
}

@vertex
fn vs(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VSOut {
  let inst = patches[instanceIndex];
  let row = u.meshResolution + 1u;
  let i = vertexIndex % row;
  let j = vertexIndex / row;
  let s = f32(i) / f32(u.meshResolution);
  let t = f32(j) / f32(u.meshResolution);

  let worldPosRelCam = inst.originRelEyeM + patchVertexOffset(inst, u.radiusM, s, t);

  var out: VSOut;
  out.clip = u.vp * vec4<f32>(worldPosRelCam, 1.0);
  // Image-space v: north at the top of the atlas slot. The rect itself is
  // applied in the fragment.
  out.uv = vec2<f32>(s, 1.0 - t);
  // f32-safe ONLY because a patch exists here at all implies the camera is
  // near Earth (the tile subsystem only engages at low altitude). A far
  // camera would make 'camPosRelBodyM' large again and this sum would
  // collapse toward it -- every normal flattening to one direction.
  let toCentreLocal = worldPosRelCam + u.camPosRelBodyM;
  out.normalLocal = vec3<f32>(
    dot(u.rotCol0, toCentreLocal),
    dot(u.rotCol1, toCentreLocal),
    dot(u.rotCol2, toCentreLocal),
  );
  // The latitude-independent unit-east tangent the bake used to write per
  // vertex, now derived.
  let lon = inst.lon0Rad + s * inst.dLonRad;
  out.tangent = vec3<f32>(-sin(lon), cos(lon), 0.0);
  out.atlasUvOrigin = inst.albedoRect.xy;
  out.atlasUvScale = inst.albedoRect.zw;
  out.fallbackUvOrigin = inst.fallbackRect.xy;
  out.fallbackUvScale = inst.fallbackRect.zw;
  out.fadeWeight = inst.fadeWeight;
  // Camera minus vertex, inverted through the same rotation and scaled into
  // body-radius units. Cancellation-free at metre scale, unlike the
  // 'camPosLocal - Ng' this replaced (two near-unit f32 vectors).
  out.viewDirLocal = (1.0 / u.radiusM) * vec3<f32>(
    -dot(u.rotCol0, worldPosRelCam),
    -dot(u.rotCol1, worldPosRelCam),
    -dot(u.rotCol2, worldPosRelCam),
  );
  return out;
}
