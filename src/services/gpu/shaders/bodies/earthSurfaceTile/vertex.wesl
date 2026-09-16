// earthSurfaceTile/vertex.wesl — every patch's geometry from an 80-byte
// 'PatchInstance' and the height atlas. The record is 'inst' -- 'patch' is a
// WGSL RESERVED WORD. 'originRelEyeM' was differenced CPU-side from the SAME
// f32-rounded anchor rebuilt here, so s = t = 0 lands on it exactly: no cracks.

import package::bodies::earthSurfaceTile::io::VSOut;
import package::bodies::earthSurfaceTile::io::PatchInstance;
import package::bodies::earthSurfaceTile::io::SurfaceTileUniforms;
import package::bodies::earthSurfaceTile::lattice::latticeHeightM;

@group(0) @binding(0) var<uniform> u: SurfaceTileUniforms;
@group(0) @binding(1) var<storage, read> patches: array<PatchInstance>;
// r32float, read with 'textureLoad' at an integer post: 'textureSample' is
// illegal in the vertex stage, r32float is not guaranteed filterable, and
// hardware bilinear in a slot atlas bleeds the neighbouring slot in along
// every patch edge (spec section 5.5 -- three independent reasons).
@group(0) @binding(2) var heightAtlas: texture_2d<f32>;

// Mirrors SURFACE_TILE_SKIRT_DEPTH_FRACTION (earthTileParams.ts),
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

// Edge order is R9's [west, east, south, north] = template i = 0, i = n,
// j = 0, j = n, one bit each. A set bit means that neighbour's HEIGHT level
// is one coarser, so the edge samples every second post -- exactly the
// lattice the neighbour itself draws (R1's strict decimation). It says
// nothing about the neighbour's MESH density, which the skirt owns (R15).
// The stride is scalar rather than per-axis because a boundary vertex's
// FIXED coordinate is always a multiple of 2 (0 or 'cells'), where doubling
// is a no-op.
fn edgeLatticeStride(i: u32, j: u32, n: u32, edgeCoarser: u32) -> f32 {
  let onCoarserEdge =
    (i == 0u && (edgeCoarser & 1u) != 0u) ||
    (i == n && (edgeCoarser & 2u) != 0u) ||
    (j == 0u && (edgeCoarser & 4u) != 0u) ||
    (j == n && (edgeCoarser & 8u) != 0u);
  return select(1.0, 2.0, onCoarserEdge);
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
  // A skirt vertex IS its boundary post -- same lattice position, same
  // interpolants; only the height it is placed at differs (depthM below).
  var i = vertexIndex % row;
  var j = vertexIndex / row;
  if (isSkirt) {
    let sid = vertexIndex - gridCount;
    let edge = sid / row;
    let k = sid % row;
    if (edge == 0u) { i = 0u; j = k; }
    else if (edge == 1u) { i = n; j = k; }
    else if (edge == 2u) { i = k; j = 0u; }
    else { i = k; j = n; }
  }
  let s = f32(i) / f32(n);
  let t = f32(j) / f32(n);

  // Lattice position in the leaf's sub-rect. The row flip: the anchor's lat0
  // is the patch's SOUTH edge and j counts north, while row 0 of a height
  // lattice is its NORTH row. 'cells' is the leaf's own, so an inherited
  // lattice (R14) lands template vertices BETWEEN ancestor posts rather than
  // off the end of a 128-cell assumption.
  let cells = f32(inst.heightCells);
  let p = vec2<f32>(f32(i) * cells / f32(n), f32(n - j) * cells / f32(n));
  let latticeH = latticeHeightM(
    heightAtlas,
    inst.heightSlotOrigin,
    p,
    edgeLatticeStride(i, j, n, inst.edgeCoarser),
    cells,
  );
  let h = select(latticeH, 0.0, u.noDisplacement > 0.5);

  // The ring hangs radially inward on EVERY edge (R15): the cut's mesh levels
  // are unbalanced, so any neighbour may have half this patch's vertices along
  // the shared edge, and the wall is what hides the T-junction. No edge code
  // gates it -- 'edge' only picks which boundary post the vertex repeats.
  var depthM = 0.0;
  if (isSkirt && u.noSkirts < 0.5) {
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
  out.heightLattice = vec3<u32>(inst.heightSlotOrigin, inst.heightCells);
  out.patchSpanRad = vec2<f32>(inst.dLonRad, inst.dLatRad);
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
