// starCatalog/cutIo.wesl — what the GPU octree cut (cut.wesl) and the vertex
// stage that draws its output (vertex.wesl 'vsCut') both read: the static
// per-node table and the per-frame cut uniform. Byte layouts mirror
// layers/starCatalog/render/starCutLayout.ts.
//
// Precision: a node box is 'gridOrigin + cell * cellEdge', a parsec-scale
// value near-equal to the camera's during a local approach. The CPU splits the
// camera into a whole cell (i32) plus a fraction in f64, so the subtraction
// here is integer-exact and only the small remainder is f32.

// One octree node, 24 B, array stride 24 (all u32).
//   grid         box min corner in LEAF cells: x | y << 10 | z << 20
//   firstRecord  base index into the records blob
//   bits         level (bits 0..3) | isAggregate (bit 4) | recordCount << 8
//   subtreeCount leaf stars under this node (the flux multiplier)
//   parent       node index of the parent; the root names itself
//   refineDelta  records its children draw, minus its own (0 for a leaf)
struct CutNode {
  grid: u32,
  firstRecord: u32,
  bits: u32,
  subtreeCount: u32,
  parent: u32,
  refineDelta: u32,
};

// Most frusta one cut prunes against: a dome rig's five faces, plus one.
const CUT_MAX_VIEWS: u32 = 6u;

// Per-source, per-frame. std140 offsets:
//    0 camCell vec3<i32>    12 cellEdgeMpc
//   16 camFrac vec3<f32>    28 refineThresholdSq
//   32 fadeStep  36 budgetTypical  40 worldSpread  44 leafMarginRad
//   48 viewCount 52 nodeCount      56 opacity      60 pad
//   64 planes    6 unit planes per view, camera-relative Mpc
struct CutUniforms {
  camCell: vec3<i32>,
  cellEdgeMpc: f32,
  camFrac: vec3<f32>,
  refineThresholdSq: f32,
  fadeStep: f32,
  budgetTypical: u32,
  worldSpread: f32,
  leafMarginRad: f32,
  viewCount: u32,
  nodeCount: u32,
  opacity: f32,
  _pad: f32,
  planes: array<vec4<f32>, 36>,
};

// Which draw list a pipeline reads: 3 for leaves (blocks of 8 instances per
// entry), 0 for aggregates (one instance per entry). 16 B, written once.
struct CutStream {
  blockShift: u32,
};

fn nodeEdgeCells(n: CutNode) -> f32 {
  return f32(1u << (n.bits & 0xfu));
}

fn nodeIsAggregate(n: CutNode) -> bool {
  return (n.bits & 0x10u) != 0u;
}

fn nodeRecordCount(n: CutNode) -> u32 {
  return n.bits >> 8u;
}

// Box min corner relative to the camera, in leaf cells.
fn nodeMinCells(n: CutNode, camCell: vec3<i32>, camFrac: vec3<f32>) -> vec3<f32> {
  let cell = vec3<i32>(
    i32(n.grid & 0x3ffu),
    i32((n.grid >> 10u) & 0x3ffu),
    i32((n.grid >> 20u) & 0x3ffu),
  );
  return vec3<f32>(cell - camCell) - camFrac;
}
