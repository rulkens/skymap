// starCatalog/cut.wesl — the per-frame octree cut, on the GPU. Derivation-heavy
// file: the header carries the scheme. A row owns the records bright enough for
// its level and, when it has children, one blob standing for all of them; each
// row gets two LOD fades (own, blob) and places in the two draw lists the vertex
// stage reads. The pool holds the index's rows, then each chunk slot's rows.
//
// ## One flat pass over every row
// The refine proxy 'edge^2 / distanceToBox^2' only shrinks going down the tree
// (a child's edge halves and its box sits inside its parent's), so "every
// ancestor refined" collapses to "the parent refined". A row draws its own
// records when its parent refines (the root always), and its blob when it draws
// its own records and does not refine itself: own + blob is its subtree's whole
// flux, so the cut conserves light level by level. A chunk root refines only
// once its chunk is resident; an empty slot's zeroed rows emit nothing.
//
// ## Folded subtrees
// Placement by brightness alone leaves sparse outskirts as chains of rows
// whose blob stands for a handful of stars, each drawn as a box-sized glow. A
// row whose subtree holds at most STAR_FOLD_RECORDS (starCutLayout.ts) is
// folded: it refines exactly when its nearest unfolded ancestor does, and the
// CPU writes that ancestor as its parent, so the subtree draws as points with
// no blob and the ancestor's refineDelta carries the subtree's cost.
//
// ## Budget as a threshold
// A best-first refine under an instance budget pops in descending proxy order,
// so it stops at one proxy value. 'histogram' sums each visible candidate's
// instance cost into log-proxy bins, 'pickThreshold' walks the bins from the top
// until the budget is spent, and 'emit' refines only bins at or above that one.
//
// ## Fades
// Each channel walks linearly to 1 when drawn and to 0 when not, and draws
// while above 0, so a split or merge cross-dissolves. Linear because luminance
// is linear in opacity: blob*(1-t) + children*t conserves flux, channel by
// channel. Off-screen rows keep their fades; only the histogram and lists skip.
//
// ## Draw lists
// A blob's entry is its row index. A row's own records number up to a few
// thousand, so they claim 'ceil(ownCount / 8)' blocks of 8 instances, one entry
// each: row | block << 22. The vertex stage finds its record from
// 'instance >> 3' with no search and discards the last block's spare instances.
//
// ## Bindings: writer -> reader
//   u         CPU each frame -> all three entry points, and vertex.wesl
//   nodes     CPU at upload  -> all three entry points, and vertex.wesl
//   nodes     CPU at chunk land/evict: the slot's rows, then the root's row
//   opacity   emit           -> emit (next frame), vertex.wesl; zeroed per slot
//                               by the CPU when a chunk lands
//   leafList  emit           -> vertex.wesl (leaf stream: own records)
//   aggList   emit           -> vertex.wesl (aggregate stream: blobs)
//   draws     CPU at upload (vertex counts); pickThreshold zeroes the instance
//             counts, emit adds to them -> drawIndirect
//   hist      histogram adds; pickThreshold drains it and leaves the chosen
//             threshold bin at hist[CUT_BINS] -> emit

import package::starCatalog::cutIo::CutNode;
import package::starCatalog::cutIo::CutUniforms;
import package::starCatalog::cutIo::nodeEdgeCells;
import package::starCatalog::cutIo::nodeHasBlob;
import package::starCatalog::cutIo::nodeChildrenResident;
import package::starCatalog::cutIo::nodeFolded;
import package::starCatalog::cutIo::nodeOwnCount;
import package::starCatalog::cutIo::rootNode;
import package::starCatalog::cutIo::OPACITY_CHANNELS;
import package::starCatalog::cutIo::OWN_OPACITY;
import package::starCatalog::cutIo::BLOB_OPACITY;
import package::starCatalog::cutIo::nodeMinCells;
import package::starCatalog::cutIo::packLeafEntry;
import package::starCatalog::cutIo::LEAF_BLOCK_SHIFT;

// Mirrors starCutLayout.ts (CUT_BINS, DRAW_RECORD_WORDS).
const CUT_BINS: u32 = 1024u;
const CUT_BINS_PER_OCTAVE: f32 = 64.0;
// 'draws' words: leaf record first, aggregate record DRAW_RECORD_WORDS on;
// instanceCount is word 1 of a record.
const DRAW_RECORD_WORDS: u32 = 4u;
const LEAF_INSTANCES: u32 = 1u;
const AGG_INSTANCES: u32 = DRAW_RECORD_WORDS + LEAF_INSTANCES;
// Guards the proxy when the camera sits inside a box (leaf cells, squared).
const MIN_DIST_SQ: f32 = 1e-15;
const HALF_DIAGONAL: f32 = 0.8660254;

@group(0) @binding(0) var<uniform> u: CutUniforms;
@group(0) @binding(1) var<storage, read> nodes: array<CutNode>;
@group(0) @binding(2) var<storage, read_write> opacity: array<f32>;
@group(0) @binding(3) var<storage, read_write> leafList: array<u32>;
@group(0) @binding(4) var<storage, read_write> aggList: array<u32>;
@group(0) @binding(5) var<storage, read_write> draws: array<atomic<u32>, 8>;
// CUT_BINS bins, then the chosen threshold bin at [CUT_BINS].
@group(0) @binding(6) var<storage, read_write> hist: array<atomic<u32>, 1025>;

fn proxyOf(i: u32) -> f32 {
  let edge = nodeEdgeCells(nodes[i].bits);
  let lo = nodeMinCells(nodes[i].grid, u.camCell, u.camFrac);
  let d = max(max(lo, -(lo + vec3<f32>(edge))), vec3<f32>(0.0));
  return edge * edge / max(dot(d, d), MIN_DIST_SQ);
}

fn binOf(proxy: f32) -> u32 {
  let octaves = log2(proxy / u.refineThresholdSq);
  return u32(clamp(octaves * CUT_BINS_PER_OCTAVE, 0.0, f32(CUT_BINS - 1u)));
}

// A refine candidate, before the budget: childful, children in the pool, and
// above the user's Detail.
fn wantsRefine(i: u32, proxy: f32) -> bool {
  let bits = nodes[i].bits;
  return nodeHasBlob(bits) && nodeChildrenResident(bits) && proxy >= u.refineThresholdSq;
}

// Outside every view's frustum. The sphere is the box grown by what it can
// paint past its own edge: a blob's glow spread (world), an own record's
// fixed-pixel dot (angular) — it may only ever over-keep.
fn offScreen(i: u32, isBlob: bool) -> bool {
  if (u.viewCount == 0u) { return false; }
  let edge = nodeEdgeCells(nodes[i].bits);
  let center = (nodeMinCells(nodes[i].grid, u.camCell, u.camFrac) + vec3<f32>(edge * 0.5)) * u.cellEdgeMpc;
  let halfDiag = edge * u.cellEdgeMpc * HALF_DIAGONAL;
  let radius = select(
    halfDiag + length(center) * u.leafMarginRad,
    halfDiag * u.worldSpread,
    isBlob,
  );
  for (var v = 0u; v < u.viewCount; v = v + 1u) {
    var outside = false;
    for (var p = v * 6u; p < v * 6u + 6u; p = p + 1u) {
      let plane = u.planes[p];
      if (dot(plane.xyz, center) + plane.w < -radius) {
        outside = true;
        break;
      }
    }
    if (!outside) { return false; }
  }
  return true;
}

@compute @workgroup_size(64)
fn histogram(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u.nodeCount) { return; }
  let proxy = proxyOf(i);
  if (!wantsRefine(i, proxy) || offScreen(i, true)) { return; }
  atomicAdd(&hist[binOf(proxy)], nodes[i].refineDelta);
}

@compute @workgroup_size(1)
fn pickThreshold() {
  // The root's own records and blob are the cut before any refine.
  let rootBits = nodes[rootNode(u.indexNodes)].bits;
  var instances = nodeOwnCount(rootBits) + select(0u, 1u, nodeHasBlob(rootBits));
  var cutBin = 0u;
  var spent = false;
  for (var b = CUT_BINS; b > 0u; b = b - 1u) {
    let cost = atomicExchange(&hist[b - 1u], 0u);
    if (spent) { continue; }
    if (instances >= u.drawBudget) {
      cutBin = b;
      spent = true;
      continue;
    }
    instances = instances + cost;
  }
  atomicStore(&hist[CUT_BINS], cutBin);
  atomicStore(&draws[LEAF_INSTANCES], 0u);
  atomicStore(&draws[AGG_INSTANCES], 0u);
}

fn refines(i: u32, cutBin: u32) -> bool {
  let j = select(i, nodes[i].parent, nodeFolded(nodes[i].bits));
  let proxy = proxyOf(j);
  return wantsRefine(j, proxy) && binOf(proxy) >= cutBin;
}

@compute @workgroup_size(64)
fn emit(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u.nodeCount) { return; }
  let cutBin = atomicLoad(&hist[CUT_BINS]);

  let bits = nodes[i].bits;
  let drawOwn = i == rootNode(u.indexNodes) || refines(nodes[i].parent, cutBin);
  let drawBlob = drawOwn && !refines(i, cutBin);
  let o = i * OPACITY_CHANNELS;
  let ownGoal = select(0.0, 1.0, drawOwn);
  let blobGoal = select(0.0, 1.0, drawBlob);
  let ownOp = opacity[o + OWN_OPACITY] + clamp(ownGoal - opacity[o + OWN_OPACITY], -u.fadeStep, u.fadeStep);
  let blobOp = opacity[o + BLOB_OPACITY] + clamp(blobGoal - opacity[o + BLOB_OPACITY], -u.fadeStep, u.fadeStep);
  opacity[o + OWN_OPACITY] = ownOp;
  opacity[o + BLOB_OPACITY] = blobOp;

  if (blobOp > 0.0 && nodeHasBlob(bits) && !offScreen(i, true)) {
    aggList[atomicAdd(&draws[AGG_INSTANCES], 1u)] = i;
  }
  let own = nodeOwnCount(bits);
  if (ownOp <= 0.0 || own == 0u || offScreen(i, false)) { return; }
  let blocks = (own + (1u << LEAF_BLOCK_SHIFT) - 1u) >> LEAF_BLOCK_SHIFT;
  let first = atomicAdd(&draws[LEAF_INSTANCES], blocks << LEAF_BLOCK_SHIFT) >> LEAF_BLOCK_SHIFT;
  for (var k = 0u; k < blocks; k = k + 1u) {
    leafList[first + k] = packLeafEntry(i, k);
  }
}
