// earthSurfaceTile/vertex.wesl — every patch's geometry from nothing but an
// 80-byte 'PatchInstance', the height atlas and the two draw builtins:
// '@builtin(instance_index)' picks the patch, '@builtin(vertex_index)' is the
// shared template's vertex id: (i, j) over the (n+1)^2 grid below (n+1)^2, a
// skirt-ring post above it (surfacePatchIndices.ts owns the same id space).
// The record is 'inst' -- 'patch' is a WGSL RESERVED WORD.
//
// 'patchVertexOffset' is the twin of src/utils/scene/patchVertexOffsetM.ts and
// the post lookup that of surfacePatchPostIndex.ts -- same names, same order,
// changed together; the f64 ground truth is tested there. 'originRelEyeM' was
// differenced in f64 CPU-side from the SAME f32-rounded anchor read here, so
// s = t = 0 lands on it exactly: no cracks.

import package::bodies::earthSurfaceTile::io::VSOut;
import package::bodies::earthSurfaceTile::io::PatchInstance;
import package::bodies::earthSurfaceTile::io::SurfaceTileUniforms;

@group(0) @binding(0) var<uniform> u: SurfaceTileUniforms;
@group(0) @binding(1) var<storage, read> patches: array<PatchInstance>;
// r32float, read with 'textureLoad' at an integer post: 'textureSample' is
// illegal in the vertex stage, r32float is not guaranteed filterable, and
// hardware bilinear in a slot atlas bleeds the neighbouring slot in along
// every patch edge (spec section 5.5 -- three independent reasons).
@group(0) @binding(2) var heightAtlas: texture_2d<f32>;

// Mirrors src/data/scene/heightTileFormat.ts -- parity-tested in
// constants.parity.test.ts, '?static' linking does no value injection.
const HEIGHT_POSTS_PER_TILE: u32 = 129u;

// Mirrors SURFACE_TILE_SKIRT_DEPTH_FRACTION (earthTileParams.ts), likewise
// parity-tested -- it is the eye-check's one tuning knob (F2-R3).
const SURFACE_TILE_SKIRT_DEPTH_FRACTION: f32 = 0.05;

// Offset from the patch's origin corner, in the body's fixed axes, metres.
// '2*sin^2(x/2)' is algebraically '1 - cos x' and NOT interchangeable with it:
// at a z19 patch's dlon of 1.2e-5 rad, '1 - cos' cancels away every
// significant f32 bit while this form keeps them all. Do not 'simplify' it.
fn patchVertexOffset(anchor: PatchInstance, radiusM: f32, s: f32, t: f32, heightM: f32) -> vec3<f32> {
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

  // 'heightM' DISTRIBUTED, never summed into radiusM: the f32 sum quantizes to
  // 0.5 m at Earth's radius and terraces every patch (spec section 7.1).
  let xE = radiusM * cE + heightM * cE;
  let xN = radiusM * cN + heightM * cN;
  let xU = radiusM * cU + heightM * cU + heightM;

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

// Twin of src/utils/scene/collapseTemplateIndex.ts. Edge order is R9's
// [west, east, south, north] = template i = 0, i = n, j = 0, j = n. Code 1
// only: at 2 the neighbour is more than one level away and has no post at the
// even index either, so that edge is skirted instead.
fn collapseTemplateIndex(i: u32, j: u32, n: u32, edgeCoarser: u32) -> vec2<u32> {
  let west = edgeCoarser & 3u;
  let east = (edgeCoarser >> 2u) & 3u;
  let south = (edgeCoarser >> 4u) & 3u;
  let north = (edgeCoarser >> 6u) & 3u;
  let alongWestEast = (i == 0u && west == 1u) || (i == n && east == 1u);
  let alongSouthNorth = (j == 0u && south == 1u) || (j == n && north == 1u);
  return vec2<u32>(
    select(i, i - (i % 2u), alongSouthNorth),
    select(j, j - (j % 2u), alongWestEast),
  );
}

@vertex
fn vs(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VSOut {
  let inst = patches[instanceIndex];
  let n = u.meshResolution;
  let row = n + 1u;
  let gridCount = row * row;
  let isSkirt = vertexIndex >= gridCount;
  // A skirt vertex IS its boundary post -- same collapse, same post index, same
  // interpolants; only the height it is placed at differs (depthM below).
  var edge = 0u;
  var rawI = vertexIndex % row;
  var rawJ = vertexIndex / row;
  if (isSkirt) {
    let sid = vertexIndex - gridCount;
    edge = sid / row;
    let k = sid % row;
    if (edge == 0u) { rawI = 0u; rawJ = k; }
    else if (edge == 1u) { rawI = n; rawJ = k; }
    else if (edge == 2u) { rawI = k; rawJ = 0u; }
    else { rawI = k; rawJ = n; }
  }
  // The snapped pair feeds BOTH (s, t) and the post index, so the two sides of
  // a collapsed edge name the same lattice point and read the same post.
  let ij = collapseTemplateIndex(rawI, rawJ, n, inst.edgeCoarser);
  let i = ij.x;
  let j = ij.y;
  let s = f32(i) / f32(n);
  let t = f32(j) / f32(n);

  // The row flip: the anchor's lat0 is the patch's SOUTH edge and j counts
  // north, while a height tile's row 0 is its NORTH row.
  let stride = (HEIGHT_POSTS_PER_TILE - 1u) / n;
  let post = vec2<u32>(i * stride, (HEIGHT_POSTS_PER_TILE - 1u) - j * stride);
  let h = textureLoad(heightAtlas, inst.heightSlotOrigin + post, 0).r;

  // Zero on every edge but a band seam (code 2), where the ring becomes a wall
  // hanging radially inward -- at zero the quads are degenerate and cost a cull.
  var depthM = 0.0;
  if (isSkirt && ((inst.edgeCoarser >> (2u * edge)) & 3u) == 2u) {
    depthM = SURFACE_TILE_SKIRT_DEPTH_FRACTION * u.radiusM * inst.dLatRad;
  }

  let worldPosRelCam = inst.originRelEyeM + patchVertexOffset(inst, u.radiusM, s, t, h - depthM);

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
