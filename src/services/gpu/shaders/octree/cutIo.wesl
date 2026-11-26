// octree/cutIo.wesl — what the GPU octree cut (cut.wesl) and the vertex
// stage that draws its output (vertex.wesl 'vs') both read: the static
// per-node table and the per-frame cut uniform. Byte layouts mirror
// services/gpu/octree/octreeCutLayout.ts.
//
// Precision: a node box is 'gridOrigin + cell * cellEdge', a parsec-scale
// value near-equal to the camera's during a local approach. The CPU splits the
// camera into a whole cell (i32) plus a fraction in f64, so the subtraction
// here is integer-exact and only the small remainder is f32. camSub carries the
// bits camFrac lacks for recordRelCamCells, the AU-close path.

// Mirrors octreeCutLayout.ts.
const GRID_AXIS_BITS: u32 = 10u;
const LEVEL_BITS: u32 = 4u;
const OWN_COUNT_SHIFT: u32 = 8u;
const LEAF_BLOCK_SHIFT: u32 = 3u;
const LEAF_BLOCK_INDEX_SHIFT: u32 = 22u;
const GRID_AXIS_MASK: u32 = (1u << GRID_AXIS_BITS) - 1u;
const NODE_LEVEL_MASK: u32 = (1u << LEVEL_BITS) - 1u;
const NODE_BLOB_BIT: u32 = 1u << LEVEL_BITS;
const NODE_RESIDENT_BIT: u32 = 1u << (LEVEL_BITS + 1u);
const NODE_FOLDED_BIT: u32 = 1u << (LEVEL_BITS + 2u);
// Sub-cells per leaf cell: a record offset's 16 bits (OFFSET_FRACTION_LEVELS).
const SUB_CELL_BITS: u32 = 16u;
const SUB_CELL_MASK: u32 = (1u << SUB_CELL_BITS) - 1u;
const SUB_CELLS: f32 = 65536.0;
// Keeps 'cells << SUB_CELL_BITS' inside i32 (~380 kpc of 23 pc cells).
const EXACT_CELLS: i32 = 16384;
// Two fade channels per row: opacity[i * OPACITY_CHANNELS + c].
const OPACITY_CHANNELS: u32 = 2u;
const OWN_OPACITY: u32 = 0u;
const BLOB_OPACITY: u32 = 1u;
const LEAF_ENTRY_NODE_MASK: u32 = (1u << LEAF_BLOCK_INDEX_SHIFT) - 1u;

// One pool row, 24 B, array stride 24 (all u32): the index's rows, then each
// slot's chunkNodeCap rows. A chunk row's parent and firstRecord are written
// pool-absolute on the CPU at upload, so both read as plain indices here.
//   grid         box min corner in LEAF cells: x | y << 10 | z << 20
//   firstRecord  first own record; the blob, if any, follows the own records
//   bits         level | hasBlob << 4 | childrenResident << 5 | folded << 6
//                | ownCount << 8
//   blobCount    real records the blob stands for (its flux multiplier)
//   parent       pool row of the parent; the index root names itself; a folded
//                row names its nearest unfolded ancestor instead
//   refineDelta  sum over children of the instances each adds (a folded child:
//                its whole subtree), minus 1 for the row's own blob; 0 when
//                childless, folded, or the chunk is absent
struct CutNode {
  grid: u32,
  firstRecord: u32,
  bits: u32,
  blobCount: u32,
  parent: u32,
  refineDelta: u32,
};

// Most frusta one cut prunes against: a dome rig's five faces, plus one.
const CUT_MAX_VIEWS: u32 = 6u;

// Per-source, per-frame. std140 offsets:
//    0 camCell vec3<i32>    12 cellEdgeMpc
//   16 camFrac vec3<f32>    28 refineThresholdSq
//   32 fadeStep  36 drawBudget     40 worldSpread  44 leafMarginRad
//   48 viewCount 52 nodeCount (pool rows)          56 opacity
//   60 indexNodes 64 camSub vec3<f32>  76 chunkNodeCap
//   80 planes    6 unit planes per view, camera-relative Mpc
struct CutUniforms {
  camCell: vec3<i32>,
  cellEdgeMpc: f32,
  camFrac: vec3<f32>,
  refineThresholdSq: f32,
  fadeStep: f32,
  drawBudget: u32,
  worldSpread: f32,
  leafMarginRad: f32,
  viewCount: u32,
  nodeCount: u32,
  opacity: f32,
  indexNodes: u32,
  camSub: vec3<f32>,
  chunkNodeCap: u32,
  planes: array<vec4<f32>, 36>,
};

// Which draw list a pipeline reads: own records (blocks of 8 instances per
// entry, blockShift 3, isBlob 0) or blobs (one per entry, 0 and 1). 16 B,
// written once.
struct CutStream {
  blockShift: u32,
  isBlob: u32,
};

fn nodeLevel(bits: u32) -> u32 {
  return bits & NODE_LEVEL_MASK;
}

fn nodeEdgeCells(bits: u32) -> f32 {
  return f32(1u << nodeLevel(bits));
}

fn nodeHasBlob(bits: u32) -> bool {
  return (bits & NODE_BLOB_BIT) != 0u;
}

// 0 only on a chunk root whose chunk is not in the pool.
fn nodeChildrenResident(bits: u32) -> bool {
  return (bits & NODE_RESIDENT_BIT) != 0u;
}

// A small subtree that refines with its parent: see 'refines' in cut.wesl.
fn nodeFolded(bits: u32) -> bool {
  return (bits & NODE_FOLDED_BIT) != 0u;
}

fn nodeOwnCount(bits: u32) -> u32 {
  return bits >> OWN_COUNT_SHIFT;
}

// The index root is the index's last row. Takes the scalar, not the struct: a
// buffer struct passed by value has read as zeros on Adreno.
fn rootNode(indexNodes: u32) -> u32 {
  return indexNodes - 1u;
}

// Box min corner, in leaf cells.
fn gridCell(grid: u32) -> vec3<i32> {
  return vec3<i32>(
    i32(grid & GRID_AXIS_MASK),
    i32((grid >> GRID_AXIS_BITS) & GRID_AXIS_MASK),
    i32((grid >> (2u * GRID_AXIS_BITS)) & GRID_AXIS_MASK),
  );
}

// Box min corner relative to the camera, in leaf cells: ~2^-24 of a cell, fine
// for culling; a drawn position near the camera wants recordRelCamCells.
fn nodeMinCells(grid: u32, camCell: vec3<i32>, camFrac: vec3<f32>) -> vec3<f32> {
  return vec3<f32>(gridCell(grid) - camCell) - camFrac;
}

// A record at 16-bit 'offset' of its level-'level' box, relative to the camera,
// in leaf cells. Near the camera every term is a cancellation of parsec-sized
// values, so it is summed in i32 sub-cells (1/65536 cell, the offset's unit) and
// the only float op left is the camSub correction: no order for a fast-math
// compiler to reassociate (Metal does, which undid an all-f32 sum). The cell
// count is clamped before the shift so i32 can't overflow for a far camera; the
// clamped-off cells come back in f32, where they are far enough not to matter.
// f32 twin: tests/helpers/starCatalog/referenceStarRecordRelCam.ts.
fn recordRelCamCells(
  grid: u32,
  level: u32,
  offset: vec3<u32>,
  camCell: vec3<i32>,
  camFrac: vec3<f32>,
  camSub: vec3<f32>,
) -> vec3<f32> {
  let scaled = offset << vec3<u32>(level);
  let cells = gridCell(grid) - camCell + vec3<i32>(scaled >> vec3<u32>(SUB_CELL_BITS));
  let near = clamp(cells, vec3<i32>(-EXACT_CELLS), vec3<i32>(EXACT_CELLS));
  let camWhole = vec3<i32>(floor(camFrac * SUB_CELLS));
  let sub = (near << vec3<u32>(SUB_CELL_BITS)) + vec3<i32>(scaled & vec3<u32>(SUB_CELL_MASK)) - camWhole;
  return (vec3<f32>(sub) - camSub) / SUB_CELLS + vec3<f32>(cells - near);
}

// A leaf-list entry: the node index, then which block of the node's records.
fn packLeafEntry(node: u32, block: u32) -> u32 {
  return node | (block << LEAF_BLOCK_INDEX_SHIFT);
}

fn leafEntryNode(entry: u32) -> u32 {
  return entry & LEAF_ENTRY_NODE_MASK;
}

fn leafEntryBlock(entry: u32) -> u32 {
  return entry >> LEAF_BLOCK_INDEX_SHIFT;
}
