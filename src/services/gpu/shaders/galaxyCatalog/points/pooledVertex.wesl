// points/pooledVertex.wesl — the pooled (octree) points pipeline's vertex entry
// point: an instance finds its record through the cut's draw list (as
// starCatalog/vertex.wesl does), decodes packGalaxyGpuRecords' six words into
// the PerVertex the flat pipeline reads from its vertex buffer, and hands it to
// 'galaxyPointVertex'. A blob then redraws as a box-filling glow ('blobGlow').
// Bindings: @group(0) Uniforms, @group(1) the shared cut, @group(2) records +
// SourceUniforms + PooledRecordUniforms (fade at binding 3 is fragment-only),
// @group(3) FocusUniforms. Position is the catalog-frame Mpc value, built from
// the grid, not the camera, so a capture face draws it right:
//   gridOrigin + (nodeMinCell + offset / 65536 * nodeEdgeCells) * cellEdgeMpc

import package::galaxyCatalog::points::io::Uniforms;
import package::galaxyCatalog::points::io::PerVertex;
import package::galaxyCatalog::points::io::VSOut;
import package::galaxyCatalog::points::vertexBody::galaxyPointVertex;
import package::galaxyCatalog::points::vertexBody::galaxyApparentPxRadius;
import package::lib::camera::worldToClip;
import package::lib::billboard::expandBillboardScreen;
import package::lib::billboard::worldLenToPx;
import package::lib::starPhotometry::K_GAUSS;
import package::lib::starPhotometry::STAR_GLOW_MAX_PX;
import package::lib::sourceUniforms::SourceUniforms;
import package::lib::focusUniforms::FocusUniforms;
import package::octree::cutIo::CutNode;
import package::octree::cutIo::CutUniforms;
import package::octree::cutIo::CutStream;
import package::octree::cutIo::OPACITY_CHANNELS;
import package::octree::cutIo::nodeEdgeCells;
import package::octree::cutIo::nodeMinCells;
import package::octree::cutIo::nodeOwnCount;
import package::octree::cutIo::leafEntryNode;
import package::octree::cutIo::leafEntryBlock;

// Per source, written at upload (galaxyPooledPointRenderer.ts). 32 B.
struct PooledRecordUniforms {
  gridOriginMpc: vec3<f32>,
  absMagQ0: f32,
  absMagQ1: f32,
  blobOverlap: f32,
  blobPeakCap: f32,
  blobGain: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var<uniform> cut: CutUniforms;
@group(1) @binding(1) var<storage, read> cutNodes: array<CutNode>;
@group(1) @binding(2) var<storage, read> cutOpacity: array<f32>;
@group(1) @binding(3) var<storage, read> cutList: array<u32>;
@group(1) @binding(4) var<uniform> cutStream: CutStream;
@group(2) @binding(0) var<storage, read> records: array<u32>;
@group(2) @binding(1) var<uniform> source: SourceUniforms;
@group(2) @binding(2) var<uniform> pooled: PooledRecordUniforms;
@group(3) @binding(0) var<uniform> focus: FocusUniforms;

// GALAXY_GPU_RECORD_WORDS (src/data/galaxyCatalog/galaxyGpuRecordWords.ts).
const RECORD_WORDS: u32 = 6u;
// Reciprocal of 65536 (OFFSET_FRACTION_LEVELS): offset 0..65535 spans one box.
const OFFSET_SCALE: f32 = 0.0000152587890625;
// GALAXY_COLUMN_SCHEMA's fixed steps (galaxyOctreeFamily.ts); only absMag's
// range is per catalog, so it alone rides PooledRecordUniforms.
const COLOUR_INDEX_STEP: f32 = 0.00784313725490196;
const AXIS_RATIO_STEP: f32 = 0.00392156862745098;
// The byte-55 angular-weight codec (decodeAngularWeight): code 0 is unweighted.
const WEIGHT_CODE_UNIT: f32 = 128.0;
const WEIGHT_CODE_SPAN: f32 = 127.0;
const FLAG_ORIENTATION_FALLBACK: u32 = 1u;
const BYTE_MASK: u32 = 0xffu;
const HALF_MASK: u32 = 0xffffu;
// The galaxy dot's exp(-4 r^2) over the unit disc, (pi / 4)(1 - e^-4): a member
// deposits peak * sizePx^2 * this * axisRatio.
const GALAXY_DOT_INTEGRAL: f32 = 0.771013;

// A blob stands for 'count' members it describes by their mean (the bake's flux-mean
// magnitude, flux-weighted size and colour), so it deposits count times the light the
// body gave that mean member (times the Debug panel's gain, 1 by default), after the
// body's per-galaxy sbAmp clamp, spread over a
// disc of half the node's projected edge times the overlap and painted with the star
// glow profile that K_GAUSS integrates. As in starCatalog/vertex.wesl, the peak divides
// by the UNCAPPED radius, so a blob drawn past the ceiling or the refine footprint
// under-deposits rather than concentrating; the peak cap discards light, never moves it.
fn blobGlow(member: VSOut, p: PerVertex, count: u32, edgeMpc: f32) -> VSOut {
  let center = worldToClip(u.cam, p.position);
  let memberPx = max(u.pointSizePx, galaxyApparentPxRadius(p, u));
  let boxPx = 0.5 * worldLenToPx(u.cam, edgeMpc, center.w);
  let rPxRaw = max(memberPx, boxPx) * pooled.blobOverlap;
  // The footprint a refining blob has at the threshold, the largest one ever shows.
  let refineCapPx = 0.5 * sqrt(cut.refineThresholdSq) * u.cam.pxPerRad * pooled.blobOverlap;
  let rPx = min(min(STAR_GLOW_MAX_PX, refineCapPx), rPxRaw);

  let memberLight = memberPx * memberPx * GALAXY_DOT_INTEGRAL * member.ellipse.z;
  let light = pooled.blobGain * f32(count) * memberLight;
  let peak = member.instanceTint.rgb * (light / (K_GAUSS * rPxRaw * rPxRaw));
  let peakMax = max(peak.r, max(peak.g, peak.b));
  var out = member;
  let capped = peak * min(1.0, pooled.blobPeakCap / max(peakMax, 1e-30));
  out.instanceTint = vec4<f32>(capped, member.instanceTint.w);
  out.clip = center + vec4<f32>(expandBillboardScreen(u.cam, center, rPx, member.uv), 0.0, 0.0);
  return out;
}

@vertex
fn vs(
  @builtin(vertex_index) vi: u32,
  @builtin(instance_index) ii: u32,
) -> VSOut {
  let shift = cutStream.blockShift;
  let entry = cutList[ii >> shift];
  let nodeIdx = leafEntryNode(entry);
  let bits = cutNodes[nodeIdx].bits;
  let local = (leafEntryBlock(entry) << shift) | (ii & ((1u << shift) - 1u));
  let isBlob = cutStream.isBlob == 1u;
  let ownCount = nodeOwnCount(bits);
  if (!isBlob && local >= ownCount) {
    // A spare instance of the node's last block: outside the clip volume.
    var skip: VSOut;
    skip.clip = vec4<f32>(2.0, 2.0, 2.0, 1.0);
    return skip;
  }
  // firstRecord is pool-absolute, so 'base' is too: the pick writes it as is.
  let base = cutNodes[nodeIdx].firstRecord + select(local, ownCount, isBlob);
  let nodeOpacity = cutOpacity[nodeIdx * OPACITY_CHANNELS + cutStream.isBlob];

  let w = base * RECORD_WORDS;
  let w0 = records[w];
  let w1 = records[w + 1u];
  let w2 = records[w + 2u];
  let w3 = records[w + 3u];
  let w4 = records[w + 4u];
  let w5 = records[w + 5u];

  let offset = vec3<f32>(f32(w0 & HALF_MASK), f32(w0 >> 16u), f32(w1 & HALF_MASK)) * OFFSET_SCALE;
  let cell = nodeMinCells(cutNodes[nodeIdx].grid, vec3<i32>(0), vec3<f32>(0.0));
  let flags = (w2 >> 16u) & BYTE_MASK;
  let axisRatio = f32(w2 & BYTE_MASK) * AXIS_RATIO_STEP;
  let weightCode = (w2 >> 8u) & BYTE_MASK;
  let magSb = unpack2x16float(w4);

  var p: PerVertex;
  p.position = pooled.gridOriginMpc + (cell + offset * nodeEdgeCells(bits)) * cut.cellEdgeMpc;
  p.magnitude = magSb.x;
  p.colorIndex = f32(w1 >> 24u) * COLOUR_INDEX_STEP;
  // The sign is the fallback flag, as in the flat slot; a zero ratio stays a round mask.
  p.axisRatio = select(axisRatio, -axisRatio, (flags & FLAG_ORIENTATION_FALLBACK) != 0u);
  p.paCosSin = unpack2x16float(w3);
  p.radiusMpc = bitcast<f32>(w5);
  p.angularWeight = select(
    pow(10.0, (f32(weightCode) - WEIGHT_CODE_UNIT) / WEIGHT_CODE_SPAN),
    1.0,
    weightCode == 0u,
  );
  p.absMag = pooled.absMagQ0 + f32((w1 >> 16u) & BYTE_MASK) * pooled.absMagQ1;
  p.sbAmp = magSb.y;

  var out = galaxyPointVertex(vi, base, p, u, source, focus);
  // A zero tint is a gated mean member: the body's off-screen clip stands. A dim one is
  // not culled, since its count can still add up to visible light.
  if (isBlob && any(out.instanceTint.rgb > vec3<f32>(0.0))) {
    out = blobGlow(out, p, cutNodes[nodeIdx].blobCount, nodeEdgeCells(bits) * cut.cellEdgeMpc);
  }
  // The cut's LOD fade: a refining node's own records fade in as its blob fades out.
  out.instanceTint = vec4<f32>(out.instanceTint.rgb * nodeOpacity, out.instanceTint.w);
  return out;
}
