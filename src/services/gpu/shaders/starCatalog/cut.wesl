// starCatalog/cut.wesl — the per-frame octree cut, on the GPU: which nodes
// draw (near cells as their real leaf stars, far subtrees as one aggregate
// glow), each node's LOD fade, and the two draw lists the vertex stage reads.
//
// ## Why this is one flat pass over every node, not a tree walk
//
// The refine proxy 'edge^2 / distanceToBox^2' can only shrink going down the
// tree (a child's edge halves and its box sits inside its parent's), so "every
// ancestor refined" collapses to "the parent refined". A node is therefore in
// the cut exactly when its parent refines and it does not — a test each node
// answers alone, from its own box and its parent's.
//
// ## The draw budget as a threshold
//
// A best-first refine under an instance budget pops candidates in descending
// proxy order, so it stops at one proxy value: everything above it refined,
// nothing below. 'histogram' sums each visible candidate's instance cost into
// log-proxy bins, 'pickThreshold' walks the bins from the top until the budget
// is spent, and 'emit' refines only bins at or above that one.
//
// ## Fades
//
// A node's opacity walks linearly toward 1 in the cut and 0 out of it, and it
// draws while above 0 — so a split or merge cross-dissolves. Linear because
// luminance is linear in opacity: parent * (1 - t) + children * t conserves
// flux. LOD membership ignores the frustum; only the emit does not, so a node
// that leaves the screen and returns has kept its opacity.
//
// ## Draw lists
//
// An aggregate is one record: its list entry is its node index. A leaf holds
// up to a few thousand, so it claims 'ceil(count / 8)' blocks of 8 instances,
// one entry each: node index | block-in-node << 22. The vertex stage finds its
// record from 'instance >> 3' with no search, and discards the last block's
// spare instances. 'draws' is the two indirect draw records the lists feed.

import package::starCatalog::cutIo::CutNode;
import package::starCatalog::cutIo::CutUniforms;
import package::starCatalog::cutIo::nodeEdgeCells;
import package::starCatalog::cutIo::nodeIsAggregate;
import package::starCatalog::cutIo::nodeRecordCount;
import package::starCatalog::cutIo::nodeMinCells;

// Mirrors starCutLayout.ts.
const CUT_BINS: u32 = 1024u;
const CUT_BINS_PER_OCTAVE: f32 = 64.0;
const LEAF_BLOCK_SHIFT: u32 = 3u;
const LEAF_BLOCK_INDEX_SHIFT: u32 = 22u;
// 'draws' words: leaf record at 0, aggregate record at 4; instanceCount is +1.
const LEAF_INSTANCES: u32 = 1u;
const AGG_INSTANCES: u32 = 5u;
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

fn proxyOf(n: CutNode) -> f32 {
  let edge = nodeEdgeCells(n);
  let lo = nodeMinCells(n, u.camCell, u.camFrac);
  let d = max(max(lo, -(lo + vec3<f32>(edge))), vec3<f32>(0.0));
  return edge * edge / max(dot(d, d), MIN_DIST_SQ);
}

fn binOf(proxy: f32) -> u32 {
  let octaves = log2(proxy / u.refineThresholdSq);
  return u32(clamp(octaves * CUT_BINS_PER_OCTAVE, 0.0, f32(CUT_BINS - 1u)));
}

// A refine candidate, before the budget: childful and above the user's Detail.
fn wantsRefine(n: CutNode, proxy: f32) -> bool {
  return nodeIsAggregate(n) && proxy >= u.refineThresholdSq;
}

// Outside every view's frustum. The sphere is the box grown by what it can
// paint past its own edge: an aggregate's glow spread (world), a leaf's
// fixed-pixel dot (angular) — it may only ever over-keep.
fn offScreen(n: CutNode) -> bool {
  if (u.viewCount == 0u) { return false; }
  let edge = nodeEdgeCells(n);
  let center = (nodeMinCells(n, u.camCell, u.camFrac) + vec3<f32>(edge * 0.5)) * u.cellEdgeMpc;
  let halfDiag = edge * u.cellEdgeMpc * HALF_DIAGONAL;
  let radius = select(
    halfDiag + length(center) * u.leafMarginRad,
    halfDiag * u.worldSpread,
    nodeIsAggregate(n),
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
  let n = nodes[i];
  let proxy = proxyOf(n);
  if (!wantsRefine(n, proxy) || offScreen(n)) { return; }
  atomicAdd(&hist[binOf(proxy)], n.refineDelta);
}

@compute @workgroup_size(1)
fn pickThreshold() {
  // The root's own record is the cut before any refine.
  var instances = nodeRecordCount(nodes[u.nodeCount - 1u]);
  var cutBin = 0u;
  var spent = false;
  for (var b = CUT_BINS; b > 0u; b = b - 1u) {
    let cost = atomicExchange(&hist[b - 1u], 0u);
    if (spent) { continue; }
    if (instances >= u.budgetTypical) {
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

fn refines(n: CutNode, cutBin: u32) -> bool {
  let proxy = proxyOf(n);
  return wantsRefine(n, proxy) && binOf(proxy) >= cutBin;
}

@compute @workgroup_size(64)
fn emit(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= u.nodeCount) { return; }
  let n = nodes[i];
  let cutBin = atomicLoad(&hist[CUT_BINS]);

  let isRoot = n.parent == i;
  let inCut = (isRoot || refines(nodes[n.parent], cutBin)) && !refines(n, cutBin);
  let goal = select(0.0, 1.0, inCut);
  let op = opacity[i] + clamp(goal - opacity[i], -u.fadeStep, u.fadeStep);
  opacity[i] = op;
  if (op <= 0.0 || offScreen(n)) { return; }

  if (nodeIsAggregate(n)) {
    aggList[atomicAdd(&draws[AGG_INSTANCES], 1u)] = i;
    return;
  }
  let blocks = (nodeRecordCount(n) + (1u << LEAF_BLOCK_SHIFT) - 1u) >> LEAF_BLOCK_SHIFT;
  let first = atomicAdd(&draws[LEAF_INSTANCES], blocks << LEAF_BLOCK_SHIFT) >> LEAF_BLOCK_SHIFT;
  for (var k = 0u; k < blocks; k = k + 1u) {
    leafList[first + k] = i | (k << LEAF_BLOCK_INDEX_SHIFT);
  }
}
