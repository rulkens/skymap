/**
 * starCutLayout — the CPU half of the GPU octree cut's byte layouts; the WESL
 * structs in `shaders/starCatalog/cutIo.wesl` and the constants in `cut.wesl`
 * are what the GPU addresses by. `cut.wesl`'s header explains the scheme.
 */

import type { StarCatalog } from '../../../@types/data/starCatalog/StarCatalog';
import type { Vec3 } from '../../../@types/math/Vec3';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { starOctreeIndex } from '../../../utils/star/starOctreeIndex';
import { mortonDecode3 } from '../../../utils/math/mortonDecode3';

/** Every cut buffer is addressed in 4-byte words. */
export const WORD_BYTES = 4;

/** `struct CutNode`: six u32, at these word slots. */
export const CUT_NODE_WORDS = 6;
export const NODE_GRID_WORD = 0;
export const NODE_FIRST_RECORD_WORD = 1;
export const NODE_BITS_WORD = 2;
export const NODE_SUBTREE_COUNT_WORD = 3;
export const NODE_PARENT_WORD = 4;
export const NODE_REFINE_DELTA_WORD = 5;
/** Octree fan-out; `childIndex` holds this many slots per node. */
const CHILDREN_PER_NODE = 8;
/** Bits per axis of `CutNode.grid`, and of `CutNode.bits`'s level. */
export const GRID_AXIS_BITS = 10;
export const LEVEL_BITS = 4;
export const RECORD_COUNT_SHIFT = 8;

/** Log-proxy budget bins (`CUT_BINS` in `cut.wesl`), plus the chosen threshold bin. */
export const CUT_BINS = 1024;
export const CUT_HIST_WORDS = CUT_BINS + 1;
/** A leaf claims blocks of `1 << LEAF_BLOCK_SHIFT` instances (`LEAF_BLOCK_SHIFT`). */
export const LEAF_BLOCK_SHIFT = 3;
/** A leaf-list entry is `node | block << LEAF_BLOCK_INDEX_SHIFT`. */
export const LEAF_BLOCK_INDEX_SHIFT = 22;
/** Two indirect draw records (leaf, then aggregate), four u32 each. */
export const CUT_DRAWS_WORDS = 8;
/** u32 words per indirect draw record; the aggregate record follows the leaf's. */
export const DRAW_RECORD_WORDS = 4;
export const AGG_DRAW_BYTE_OFFSET = DRAW_RECORD_WORDS * WORD_BYTES;
/** Each record's vertex count: one circumscribing triangle per instance. */
const BILLBOARD_VERTEX_COUNT = 3;

/** `struct CutStream`: one u32 padded to a uniform's 16 bytes. */
export const CUT_STREAM_BYTES = 16;

/** Frusta one cut prunes against (`CUT_MAX_VIEWS`); more views ⇒ no prune. */
export const CUT_MAX_VIEWS = 6;
const PLANES_PER_VIEW = 6;
const PLANE_FLOATS = 4;
/** Floats one view contributes to `planes`: six vec4 planes. */
export const FLOATS_PER_VIEW = PLANES_PER_VIEW * PLANE_FLOATS;

/**
 * `struct CutUniforms`: a 64-byte head, then the planes. Word slots of the
 * head, in the order `cutIo.wesl` declares them (word 15 is pad).
 */
export const CAM_CELL_INT_INDEX = 0;
export const CELL_EDGE_MPC_FLOAT_INDEX = 3;
export const CAM_FRAC_FLOAT_INDEX = 4;
export const REFINE_THRESHOLD_SQ_FLOAT_INDEX = 7;
export const FADE_STEP_FLOAT_INDEX = 8;
export const BUDGET_TYPICAL_U32_INDEX = 9;
export const WORLD_SPREAD_FLOAT_INDEX = 10;
export const LEAF_MARGIN_RAD_FLOAT_INDEX = 11;
export const VIEW_COUNT_U32_INDEX = 12;
export const NODE_COUNT_U32_INDEX = 13;
export const OPACITY_FLOAT_INDEX = 14;
export const PLANES_FLOAT_INDEX = 16;
const CUT_UNIFORM_HEAD_BYTES = PLANES_FLOAT_INDEX * WORD_BYTES;
export const CUT_UNIFORM_BYTES =
  CUT_UNIFORM_HEAD_BYTES + CUT_MAX_VIEWS * FLOATS_PER_VIEW * WORD_BYTES;
/** Far past the grid the cell split is immaterial; the clamp keeps it an i32. */
const CAM_CELL_LIMIT = 2 ** 30;

/** Workgroup size of `histogram` and `emit`. */
export const CUT_WORKGROUP = 64;

/** The two indirect draw records before any cut: vertex counts set, instance counts zero. */
export function initialCutDraws(): Uint32Array {
  const draws = new Uint32Array(CUT_DRAWS_WORDS);
  draws[0] = BILLBOARD_VERTEX_COUNT;
  draws[DRAW_RECORD_WORDS] = BILLBOARD_VERTEX_COUNT;
  return draws;
}

/** The static node table: one `CutNode` per octree node, in catalog order. */
export function packStarCutNodes(catalog: StarCatalog): Uint32Array {
  const { nodes } = catalog;
  const { childIndex, subtreeCounts } = starOctreeIndex(catalog);
  const n = nodes.length;
  const blockIndexLimit = 2 ** (32 - LEAF_BLOCK_INDEX_SHIFT);
  if (n >= 2 ** LEAF_BLOCK_INDEX_SHIFT) {
    throw new Error(`starCut: ${n} nodes overflow the ${LEAF_BLOCK_INDEX_SHIFT}-bit node index`);
  }

  const out = new Uint32Array(n * CUT_NODE_WORDS);
  for (let i = 0; i < n; i++) {
    const node = nodes[i]!;
    if (node.level >= 2 ** LEVEL_BITS) throw new Error(`starCut: level ${node.level} overflows`);
    if (node.recordCount > blockIndexLimit << LEAF_BLOCK_SHIFT) {
      throw new Error(`starCut: ${node.recordCount} records overflow one node's block index`);
    }
    // Leaf-cell units: a level-L node's own Morton cell is 2^L leaf cells wide.
    const [cx, cy, cz] = mortonDecode3(node.mortonIndex);
    const gx = cx * 2 ** node.level;
    const gy = cy * 2 ** node.level;
    const gz = cz * 2 ** node.level;
    if (Math.max(gx, gy, gz) >= 2 ** GRID_AXIS_BITS) {
      throw new Error(`starCut: grid wider than ${2 ** GRID_AXIS_BITS} leaf cells per axis`);
    }

    const isAggregate = node.childMask !== 0;
    let childRecords = 0;
    const o = i * CUT_NODE_WORDS;
    // The root is the last node and names itself.
    if (i === n - 1) out[o + NODE_PARENT_WORD] = i;
    for (let k = 0; k < CHILDREN_PER_NODE; k++) {
      const child = childIndex[i * CHILDREN_PER_NODE + k]!;
      if (child < 0) continue;
      childRecords += nodes[child]!.recordCount;
      out[child * CUT_NODE_WORDS + NODE_PARENT_WORD] = i;
    }
    out[o + NODE_GRID_WORD] = gx | (gy << GRID_AXIS_BITS) | (gz << (2 * GRID_AXIS_BITS));
    out[o + NODE_FIRST_RECORD_WORD] = node.firstRecord;
    out[o + NODE_BITS_WORD] =
      node.level | (isAggregate ? 1 << LEVEL_BITS : 0) | (node.recordCount << RECORD_COUNT_SHIFT);
    out[o + NODE_SUBTREE_COUNT_WORD] = subtreeCounts[i]!;
    out[o + NODE_REFINE_DELTA_WORD] = isAggregate ? childRecords - node.recordCount : 0;
  }
  return out;
}

/** Entries the leaf list can ever hold: every leaf's blocks at once. */
export function leafListCapacity(catalog: StarCatalog): number {
  let blocks = 0;
  for (const node of catalog.nodes) {
    if (node.childMask === 0) blocks += Math.ceil(node.recordCount / (1 << LEAF_BLOCK_SHIFT));
  }
  return blocks;
}

/**
 * Fill one source's `CutUniforms`. The camera splits into a whole leaf cell
 * plus a fraction HERE, in f64, so the shader's node-minus-camera is
 * integer-exact (see `cutIo.wesl`). `planes` holds `FLOATS_PER_VIEW` floats per
 * view; none means no prune.
 */
export function writeStarCutUniforms(
  out: ArrayBuffer,
  catalog: StarCatalog,
  camPosMpc: Readonly<Vec3>,
  cut: {
    readonly refineThreshold: number;
    readonly fadeStep: number;
    readonly budgetTypical: number;
    readonly worldSpread: number;
    readonly leafMarginRad: number;
    readonly opacity: number;
    readonly planes: Float32Array;
  },
): void {
  const i32 = new Int32Array(out);
  const u32 = new Uint32Array(out);
  const f32 = new Float32Array(out);
  for (let a = 0; a < 3; a++) {
    const cells =
      (camPosMpc[a]! * SCALE_UNITS.MPC_TO_PC - catalog.gridOrigin[a]!) / catalog.cellEdgePc;
    const whole = Math.max(-CAM_CELL_LIMIT, Math.min(CAM_CELL_LIMIT, Math.floor(cells)));
    i32[CAM_CELL_INT_INDEX + a] = whole;
    f32[CAM_FRAC_FLOAT_INDEX + a] = cells - whole;
  }
  f32[CELL_EDGE_MPC_FLOAT_INDEX] = catalog.cellEdgePc * SCALE_UNITS.PC_TO_MPC;
  f32[REFINE_THRESHOLD_SQ_FLOAT_INDEX] = cut.refineThreshold * cut.refineThreshold;
  f32[FADE_STEP_FLOAT_INDEX] = cut.fadeStep;
  u32[BUDGET_TYPICAL_U32_INDEX] = cut.budgetTypical;
  f32[WORLD_SPREAD_FLOAT_INDEX] = cut.worldSpread;
  f32[LEAF_MARGIN_RAD_FLOAT_INDEX] = cut.leafMarginRad;
  const views = cut.planes.length / FLOATS_PER_VIEW;
  const viewCount = views <= CUT_MAX_VIEWS ? views : 0;
  u32[VIEW_COUNT_U32_INDEX] = viewCount;
  u32[NODE_COUNT_U32_INDEX] = catalog.nodes.length;
  f32[OPACITY_FLOAT_INDEX] = cut.opacity;
  f32.set(cut.planes.subarray(0, viewCount * FLOATS_PER_VIEW), PLANES_FLOAT_INDEX);
}
