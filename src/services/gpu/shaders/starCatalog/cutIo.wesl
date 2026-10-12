// starCatalog/cutIo.wesl — what the GPU octree cut (cut.wesl) and the vertex
// stage that draws its output (vertex.wesl 'vs') both read: the static
// per-node table and the per-frame cut uniform. Byte layouts mirror
// layers/starCatalog/render/starCutLayout.ts.
//
// Precision: a node box is 'gridOrigin + cell * cellEdge', a parsec-scale
// value near-equal to the camera's during a local approach. The CPU splits the
// camera into a whole cell (i32) plus a fraction in f64, so the subtraction
// here is integer-exact and only the small remainder is f32.

// Mirrors starCutLayout.ts.
const GRID_AXIS_BITS: u32 = 10u;
const LEVEL_BITS: u32 = 4u;
const OWN_COUNT_SHIFT: u32 = 8u;
const LEAF_ENTRY_RECORD_SHIFT: u32 = 20u;
const GRID_AXIS_MASK: u32 = (1u << GRID_AXIS_BITS) - 1u;
const NODE_LEVEL_MASK: u32 = (1u << LEVEL_BITS) - 1u;
const NODE_BLOB_BIT: u32 = 1u << LEVEL_BITS;
const NODE_RESIDENT_BIT: u32 = 1u << (LEVEL_BITS + 1u);
const NODE_FOLDED_BIT: u32 = 1u << (LEVEL_BITS + 2u);
// Two fade channels per row: opacity[i * OPACITY_CHANNELS + c].
const OPACITY_CHANNELS: u32 = 2u;
const OWN_OPACITY: u32 = 0u;
const BLOB_OPACITY: u32 = 1u;
const LEAF_ENTRY_NODE_MASK: u32 = (1u << LEAF_ENTRY_RECORD_SHIFT) - 1u;

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
//   60 indexNodes 64 chunkNodeCap  68-76 pad
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
  chunkNodeCap: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  planes: array<vec4<f32>, 36>,
};

// Which draw list a pipeline reads: own records (isBlob 0) or blobs (1), one
// instance per entry either way. 16 B, written once.
struct CutStream {
  isBlob: u32,
};

fn nodeEdgeCells(bits: u32) -> f32 {
  return f32(1u << (bits & NODE_LEVEL_MASK));
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

// Box min corner relative to the camera, in leaf cells.
fn nodeMinCells(grid: u32, camCell: vec3<i32>, camFrac: vec3<f32>) -> vec3<f32> {
  let cell = vec3<i32>(
    i32(grid & GRID_AXIS_MASK),
    i32((grid >> GRID_AXIS_BITS) & GRID_AXIS_MASK),
    i32((grid >> (2u * GRID_AXIS_BITS)) & GRID_AXIS_MASK),
  );
  return vec3<f32>(cell - camCell) - camFrac;
}

// A leaf-list entry: the node index, then which of the node's own records.
fn packLeafEntry(node: u32, record: u32) -> u32 {
  return node | (record << LEAF_ENTRY_RECORD_SHIFT);
}

fn leafEntryNode(entry: u32) -> u32 {
  return entry & LEAF_ENTRY_NODE_MASK;
}

// 0 for a blob entry, whose high bits are clear.
fn leafEntryRecord(entry: u32) -> u32 {
  return entry >> LEAF_ENTRY_RECORD_SHIFT;
}
