// surfaceTile/vertex.wesl — every patch's geometry from a 96-byte
// 'PatchInstance' and the height atlas. The record is 'inst' -- 'patch' is a
// WGSL RESERVED WORD. 'originRelEyeM' was differenced CPU-side from the SAME
// f32-rounded anchor rebuilt here, so eastFraction = northFraction = 0 lands on it exactly: no cracks.

import package::bodies::surfaceTile::io::VSOut;
import package::bodies::surfaceTile::io::PatchInstance;
import package::bodies::surfaceTile::io::SurfaceTileUniforms;
import package::bodies::surfaceTile::lattice::latticeHeightM;

@group(0) @binding(0) var<uniform> uniforms: SurfaceTileUniforms;
@group(0) @binding(1) var<storage, read> patches: array<PatchInstance>;
// Terrain-RGB codes, read with 'textureLoad' at an integer post: 'textureSample'
// is illegal in the vertex stage, filtering encoded bytes is meaningless, and
// hardware bilinear in a slot atlas bleeds the neighbouring slot in along
// every patch edge (spec section 5.5 -- three independent reasons).
@group(0) @binding(2) var heightAtlas: texture_2d<f32>;

// Mirrors SURFACE_TILE_SKIRT_DEPTH_FRACTION (surfaceTileParams.ts),
// parity-tested -- it is the eye-check's one tuning knob (F2-R3).
const SURFACE_TILE_SKIRT_DEPTH_FRACTION: f32 = 0.05;

// Offset from the patch's origin corner, in the body's fixed axes, metres.
// '2*sin^2(x/2)' is algebraically '1 - cos x' and NOT interchangeable with it:
// at a z19 patch's dlon of 1.2e-5 rad, '1 - cos' cancels away every
// significant f32 bit while this form keeps them all. Do not 'simplify' it.
// Scalars, never the PatchInstance by value: Adreno (Android Chrome) reads the
// copied storage-buffer struct's angles as ~0, collapsing every patch onto its
// corner -- see RENDERER.md.
fn patchVertexOffset(
  lon0Rad: f32,
  lat0Rad: f32,
  dLonRad: f32,
  dLatRad: f32,
  radiusM: f32,
  eastFraction: f32,
  northFraction: f32,
  heightM: f32
) -> vec3<f32> {
  let dlon = eastFraction * dLonRad;
  let dlat = northFraction * dLatRad;
  let lat = lat0Rad + dlat;

  let sinHalfLon = sin(dlon / 2.0);
  let sinHalfLat = sin(dlat / 2.0);
  let havLon = 2.0 * sinHalfLon * sinHalfLon;
  let havLat = 2.0 * sinHalfLat * sinHalfLat;
  let cosLat = cos(lat);
  let unitEast = cosLat * sin(dlon);
  let unitNorth = sin(dlat) + cosLat * sin(lat0Rad) * havLon;
  let unitUp = -havLat - cosLat * cos(lat0Rad) * havLon;

  // 'heightM' DISTRIBUTED, never summed into radiusM: the f32 sum quantizes to
  // 0.5 m at Earth's radius and terraces every patch (spec section 7.1).
  let eastM = radiusM * unitEast + heightM * unitEast;
  let northM = radiusM * unitNorth + heightM * unitNorth;
  let upM = radiusM * unitUp + heightM * unitUp + heightM;

  // The ENU frame at (lon0, lat0) in the body's fixed axes -- +Z the pole,
  // longitude 0 on +X, the convention 'equirectUvToDirection' fixes.
  let sinLon0 = sin(lon0Rad);
  let cosLon0 = cos(lon0Rad);
  let sinLat0 = sin(lat0Rad);
  let cosLat0 = cos(lat0Rad);
  return vec3<f32>(
    eastM * -sinLon0 + northM * -(sinLat0 * cosLon0) + upM * (cosLat0 * cosLon0),
    eastM * cosLon0 + northM * -(sinLat0 * sinLon0) + upM * (cosLat0 * sinLon0),
    northM * cosLat0 + upM * sinLat0,
  );
}

// Edge order is R9's [west, east, south, north] = template columnIndex = 0, columnIndex = meshResolution,
// rowIndex = 0, rowIndex = meshResolution, one bit each. A set bit means that neighbour's HEIGHT level
// is one coarser, so the edge samples every second post -- exactly the
// lattice the neighbour itself draws (R1's strict decimation). It says
// nothing about the neighbour's MESH density, which the skirt owns (R15).
// The stride is scalar rather than per-axis because a boundary vertex's
// FIXED coordinate is always a multiple of 2 (0 or 'cells'), where doubling
// is a no-op.
fn edgeLatticeStride(columnIndex: u32, rowIndex: u32, meshResolution: u32, edgeCoarser: u32) -> f32 {
  let onCoarserEdge =
    (columnIndex == 0u && (edgeCoarser & 1u) != 0u) ||
    (columnIndex == meshResolution && (edgeCoarser & 2u) != 0u) ||
    (rowIndex == 0u && (edgeCoarser & 4u) != 0u) ||
    (rowIndex == meshResolution && (edgeCoarser & 8u) != 0u);
  return select(1.0, 2.0, onCoarserEdge);
}

@vertex
fn vs(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VSOut {
  let inst = patches[instanceIndex];
  let meshResolution = uniforms.meshResolution;
  let row = meshResolution + 1u;
  let gridCount = row * row;
  let isSkirt = vertexIndex >= gridCount;
  // A skirt vertex IS its boundary post -- same lattice position, same
  // interpolants; only the height it is placed at differs (depthM below).
  var columnIndex = vertexIndex % row;
  var rowIndex = vertexIndex / row;
  if (isSkirt) {
    let sid = vertexIndex - gridCount;
    let edge = sid / row;
    let edgePostIndex = sid % row;
    if (edge == 0u) { columnIndex = 0u; rowIndex = edgePostIndex; }
    else if (edge == 1u) { columnIndex = meshResolution; rowIndex = edgePostIndex; }
    else if (edge == 2u) { columnIndex = edgePostIndex; rowIndex = 0u; }
    else { columnIndex = edgePostIndex; rowIndex = meshResolution; }
  }
  let eastFraction = f32(columnIndex) / f32(meshResolution);
  let northFraction = f32(rowIndex) / f32(meshResolution);

  // Lattice position in the leaf's sub-rect. The row flip: the anchor's lat0
  // is the patch's SOUTH edge and rowIndex counts north, while row 0 of a height
  // lattice is its NORTH row. 'cells' is the leaf's own, so an inherited
  // lattice (R14) lands template vertices BETWEEN ancestor posts rather than
  // off the end of a 128-cell assumption.
  let cells = f32(inst.heightCells);
  let latticePos = vec2<f32>(f32(columnIndex) * cells / f32(meshResolution), f32(meshResolution - rowIndex) * cells / f32(meshResolution));
  let latticeH = latticeHeightM(
    heightAtlas,
    inst.heightSlotOrigin,
    latticePos,
    edgeLatticeStride(columnIndex, rowIndex, meshResolution, inst.edgeCoarser),
    cells,
  );
  let heightM = select(latticeH, 0.0, uniforms.noDisplacement > 0.5);

  // The ring hangs radially inward on EVERY edge (R15): the cut's mesh levels
  // are unbalanced, so any neighbour may have half this patch's vertices along
  // the shared edge, and the wall is what hides the T-junction. No edge code
  // gates it -- 'edge' only picks which boundary post the vertex repeats.
  var depthM = 0.0;
  if (isSkirt && uniforms.noSkirts < 0.5) {
    depthM = SURFACE_TILE_SKIRT_DEPTH_FRACTION * uniforms.radiusM * inst.dLatRad;
  }

  let worldPosRelCam = inst.originRelEyeM + patchVertexOffset(
    inst.lon0Rad, inst.lat0Rad, inst.dLonRad, inst.dLatRad, uniforms.radiusM, eastFraction, northFraction, heightM - depthM
  );

  var out: VSOut;
  out.clip = uniforms.vp * vec4<f32>(worldPosRelCam, 1.0);
  // Image-space v: north at the top of the atlas slot. The rect itself is
  // applied in the fragment.
  out.uv = vec2<f32>(eastFraction, 1.0 - northFraction);
  // f32-safe ONLY because a patch exists here at all implies the camera is
  // near Earth (the tile subsystem only engages at low altitude). A far
  // camera would make 'camPosRelBodyM' large again and this sum would
  // collapse toward it -- every normal flattening to one direction.
  let toCentreLocal = worldPosRelCam + uniforms.camPosRelBodyM;
  out.normalLocal = vec3<f32>(
    dot(uniforms.rotCol0, toCentreLocal),
    dot(uniforms.rotCol1, toCentreLocal),
    dot(uniforms.rotCol2, toCentreLocal),
  );
  // The latitude-independent unit-east tangent the bake used to write per
  // vertex, now derived.
  let lon = inst.lon0Rad + eastFraction * inst.dLonRad;
  out.tangent = vec3<f32>(-sin(lon), cos(lon), 0.0);
  out.atlasUvOrigin = inst.albedoRect.xy;
  out.atlasUvScale = inst.albedoRect.zw;
  out.fallbackUvOrigin = inst.fallbackRect.xy;
  out.fallbackUvScale = inst.fallbackRect.zw;
  out.fadeWeight = inst.fadeWeight;
  out.nightRect = inst.nightRect;
  out.heightLattice = vec3<u32>(inst.heightSlotOrigin, inst.heightCells);
  out.patchSpanRad = vec2<f32>(inst.dLonRad, inst.dLatRad);
  // Camera minus vertex, inverted through the same rotation and scaled into
  // body-radius units. Cancellation-free at metre scale, unlike the
  // 'camPosLocal - geometricNormal' this replaced (two near-unit f32 vectors).
  out.viewDirLocal = (1.0 / uniforms.radiusM) * vec3<f32>(
    -dot(uniforms.rotCol0, worldPosRelCam),
    -dot(uniforms.rotCol1, worldPosRelCam),
    -dot(uniforms.rotCol2, worldPosRelCam),
  );
  return out;
}
