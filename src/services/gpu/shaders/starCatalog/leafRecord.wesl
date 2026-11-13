// starCatalog/leafRecord.wesl — one cut-list instance decoded into its star:
// the node lookup, the box rebuild and the record words. The visual and pick
// stage (vertex.wesl) and the antique print stage (vertexPrint.wesl) all read
// records through leafRecord, so they place and rank every star alike.
// Bindings: @group(1) cut* (cutIo.wesl structs and this stream's list),
// @group(2) records.
//
// Record words (the inverse of packStarGpuRecords), offsets a 16-bit fraction
// of the owning node's box: w0 = x | y << 16, w1 = z | absMagIdx << 16 | colorIdx << 23.
// cutIo.wesl's camera split makes node-minus-camera integer-exact, so
//   worldRelCam = originRelCamMpc + (offset / 65536) * cellScaleMpc
// arrives small and well-conditioned.

import package::octree::cutIo::CutNode;
import package::octree::cutIo::CutUniforms;
import package::octree::cutIo::CutStream;
import package::octree::cutIo::nodeEdgeCells;
import package::octree::cutIo::nodeOwnCount;
import package::octree::cutIo::OPACITY_CHANNELS;
import package::octree::cutIo::nodeMinCells;
import package::octree::cutIo::leafEntryNode;
import package::octree::cutIo::leafEntryBlock;

@group(1) @binding(0) var<uniform> cut: CutUniforms;
@group(1) @binding(1) var<storage, read> cutNodes: array<CutNode>;
@group(1) @binding(2) var<storage, read> cutOpacity: array<f32>;
@group(1) @binding(3) var<storage, read> cutList: array<u32>;
@group(1) @binding(4) var<uniform> cutStream: CutStream;
@group(2) @binding(0) var<storage, read> records: array<u32>;

// Dequant constants, mirroring the frozen windows in
// src/data/starCatalog/starCatalogFormat.ts (never diverge):
//   lutIndexToAbsMag(i) = STAR_ABSMAG_MIN + (i + 0.5) * STAR_ABSMAG_STEP
//   colorIdxToBpRp(i)   = STAR_COLORIDX_MIN + (i + 0.5) * STAR_COLORIDX_STEP
const STAR_ABSMAG_MIN: f32 = -6.0;
const STAR_ABSMAG_STEP: f32 = 0.19;
const STAR_COLORIDX_MIN: f32 = -0.6;
// (4.4 - (-0.6)) / 64
const STAR_COLORIDX_STEP: f32 = 0.078125;

// Reciprocal of 65536 (OFFSET_FRACTION_LEVELS): offset 0..65535 spans one box.
const OFFSET_SCALE: f32 = 0.0000152587890625;
// packStarGpuRecords' word layout.
const OFFSET_MASK: u32 = 0xffffu;
const GPU_Y_SHIFT: u32 = 16u;
const GPU_ABSMAG_SHIFT: u32 = 16u;
const GPU_ABSMAG_MASK: u32 = 0x7fu;
const GPU_COLOR_SHIFT: u32 = 23u;
const GPU_COLOR_MASK: u32 = 0x3fu;

struct LeafRecord {
  // False for a spare instance of a node's last block of 8: draw nothing.
  live: bool,
  // Drawn from the stream's blob list: the record stands for its subtree.
  isAgg: bool,
  // Pool-absolute record index: the pick stamps it as is.
  base: u32,
  worldRelCam: vec3<f32>,
  // The node box's edge, Mpc: an aggregate's on-screen extent.
  cellScaleMpc: f32,
  // Mean star magnitude for an aggregate (mergeFluxAggregate).
  absMag: f32,
  bpRp: f32,
  // Stars the record stands for: 1 for an own record.
  subtreeStarCount: f32,
  // The node's fade for this stream, times the cut's source opacity.
  opacity: f32,
}

// 'cutStream.blockShift' is 3 for the leaf list (blocks of 8 own records per
// entry) and 0 for the aggregate list (one blob per entry, local 0).
fn leafRecord(ii: u32) -> LeafRecord {
  var r: LeafRecord;
  let shift = cutStream.blockShift;
  let entry = cutList[ii >> shift];
  let nodeIdx = leafEntryNode(entry);
  let bits = cutNodes[nodeIdx].bits;
  let local = (leafEntryBlock(entry) << shift) | (ii & ((1u << shift) - 1u));
  r.isAgg = cutStream.isBlob == 1u;
  let ownCount = nodeOwnCount(bits);
  r.live = r.isAgg || local < ownCount;
  let originRelCamMpc = nodeMinCells(cutNodes[nodeIdx].grid, cut.camCell, cut.camFrac) * cut.cellEdgeMpc;
  r.cellScaleMpc = nodeEdgeCells(bits) * cut.cellEdgeMpc;
  // firstRecord is pool-absolute, so 'base' is too.
  r.base = cutNodes[nodeIdx].firstRecord + select(local, ownCount, r.isAgg);
  r.opacity = cutOpacity[nodeIdx * OPACITY_CHANNELS + cutStream.isBlob] * cut.opacity;
  r.subtreeStarCount = select(1.0, f32(cutNodes[nodeIdx].blobCount), r.isAgg);

  let w0 = records[r.base * 2u + 0u];
  let w1 = records[r.base * 2u + 1u];
  let offset = vec3<f32>(f32(w0 & OFFSET_MASK), f32(w0 >> GPU_Y_SHIFT), f32(w1 & OFFSET_MASK)) * OFFSET_SCALE;
  r.worldRelCam = originRelCamMpc + offset * r.cellScaleMpc;
  let absMagIdx = (w1 >> GPU_ABSMAG_SHIFT) & GPU_ABSMAG_MASK;
  let colorIdx = (w1 >> GPU_COLOR_SHIFT) & GPU_COLOR_MASK;
  r.absMag = STAR_ABSMAG_MIN + (f32(absMagIdx) + 0.5) * STAR_ABSMAG_STEP;
  r.bpRp = STAR_COLORIDX_MIN + (f32(colorIdx) + 0.5) * STAR_COLORIDX_STEP;
  return r;
}

// The cut's refine threshold (squared angular box size): the visual stage caps
// an unopened aggregate at the footprint it had there.
fn cutRefineThresholdSq() -> f32 {
  return cut.refineThresholdSq;
}
