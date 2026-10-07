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

/** `struct CutNode`: six u32. */
export const CUT_NODE_WORDS = 6;
/** Bits per axis of `CutNode.grid`, and of `CutNode.bits`'s level. */
export const GRID_AXIS_BITS = 10;
export const LEVEL_BITS = 4;
export const RECORD_COUNT_SHIFT = 8;

/** Log-proxy budget bins (`CUT_BINS`), plus the chosen threshold bin. */
export const CUT_HIST_WORDS = 1024 + 1;
/** A leaf claims blocks of `1 << LEAF_BLOCK_SHIFT` instances (`LEAF_BLOCK_SHIFT`). */
export const LEAF_BLOCK_SHIFT = 3;
/** A leaf-list entry is `node | block << LEAF_BLOCK_INDEX_SHIFT`. */
export const LEAF_BLOCK_INDEX_SHIFT = 22;
/** Two indirect draw records (leaf, then aggregate), four u32 each. */
export const CUT_DRAWS_WORDS = 8;
/** u32 words per indirect draw record; the aggregate record follows the leaf's. */
export const DRAW_RECORD_WORDS = 4;
export const AGG_DRAW_BYTE_OFFSET = DRAW_RECORD_WORDS * 4;

/** Frusta one cut prunes against (`CUT_MAX_VIEWS`); more views ⇒ no prune. */
export const CUT_MAX_VIEWS = 6;
const PLANES_FLOAT_INDEX = 16;
/** Floats one view contributes to `planes`: six vec4 planes. */
export const FLOATS_PER_VIEW = 24;
/** `struct CutUniforms`: a 64-byte head, then six vec4 planes per view. */
export const CUT_UNIFORM_BYTES = 64 + CUT_MAX_VIEWS * 6 * 16;

/** Workgroup size of `histogram` and `emit`. */
export const CUT_WORKGROUP = 64;

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
      throw new Error('starCut: grid wider than 1024 leaf cells per axis');
    }

    const isAggregate = node.childMask !== 0;
    let childRecords = 0;
    const o = i * CUT_NODE_WORDS;
    // The root is the last node and names itself.
    if (i === n - 1) out[o + 4] = i;
    for (let k = 0; k < 8; k++) {
      const child = childIndex[i * 8 + k]!;
      if (child < 0) continue;
      childRecords += nodes[child]!.recordCount;
      out[child * CUT_NODE_WORDS + 4] = i;
    }
    out[o] = gx | (gy << GRID_AXIS_BITS) | (gz << (2 * GRID_AXIS_BITS));
    out[o + 1] = node.firstRecord;
    out[o + 2] =
      node.level | (isAggregate ? 1 << LEVEL_BITS : 0) | (node.recordCount << RECORD_COUNT_SHIFT);
    out[o + 3] = subtreeCounts[i]!;
    out[o + 5] = isAggregate ? childRecords - node.recordCount : 0;
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
 * integer-exact (see `cutIo.wesl`). `planes` holds `FLOATS_PER_VIEW` floats per view; none means no prune.
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
    // Far past the grid the split no longer matters; the clamp keeps it an i32.
    const whole = Math.max(-(2 ** 30), Math.min(2 ** 30, Math.floor(cells)));
    i32[a] = whole;
    f32[4 + a] = cells - whole;
  }
  f32[3] = catalog.cellEdgePc * SCALE_UNITS.PC_TO_MPC;
  f32[7] = cut.refineThreshold * cut.refineThreshold;
  f32[8] = cut.fadeStep;
  u32[9] = cut.budgetTypical;
  f32[10] = cut.worldSpread;
  f32[11] = cut.leafMarginRad;
  const views = cut.planes.length / FLOATS_PER_VIEW;
  const viewCount = views <= CUT_MAX_VIEWS ? views : 0;
  u32[12] = viewCount;
  u32[13] = catalog.nodes.length;
  f32[14] = cut.opacity;
  f32.set(cut.planes.subarray(0, viewCount * FLOATS_PER_VIEW), PLANES_FLOAT_INDEX);
}
