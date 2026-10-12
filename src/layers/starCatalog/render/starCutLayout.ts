/**
 * starCutLayout — the CPU half of the GPU octree cut's byte layouts; the WESL
 * structs in `shaders/starCatalog/cutIo.wesl` and the constants in `cut.wesl`
 * are what the GPU addresses by. `cut.wesl`'s header explains the scheme.
 */

import type { StarChunk } from '../../../@types/data/starCatalog/StarChunk';
import type { StarOctree } from '../../../@types/data/starCatalog/StarOctree';
import type { StarChunkRoot } from '../@types/StarChunkRoot';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { OctreeNodeTable } from '../../../@types/octree/OctreeNodeTable';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import {
  LEVEL_KEY_STRIDE,
  MAX_GRID_BITS,
  MAX_OWN_COUNT,
  NO_CHUNK_REF,
  OCTANT_BITS,
} from '../../../data/octree/octreeFormat';
import { SELECTION_SOURCE_SHIFT } from '../../../data/selectionEncoding';
import { mortonDecode3 } from '../../../utils/math/mortonDecode3';

/** Every cut buffer is addressed in 4-byte words. */
export const WORD_BYTES = 4;

/** `struct CutNode`: six u32, at these word slots. */
export const CUT_NODE_WORDS = 6;
export const NODE_GRID_WORD = 0;
export const NODE_FIRST_RECORD_WORD = 1;
export const NODE_BITS_WORD = 2;
export const NODE_BLOB_COUNT_WORD = 3;
export const NODE_PARENT_WORD = 4;
export const NODE_REFINE_DELTA_WORD = 5;
/** Bits per axis of `CutNode.grid`, and of `CutNode.bits`'s level. */
export const GRID_AXIS_BITS = 10;
export const LEVEL_BITS = 4;
/** `CutNode.bits`: level, then hasBlob, childrenResident, folded, then ownCount. */
export const NODE_BLOB_BIT = 1 << LEVEL_BITS;
export const NODE_RESIDENT_BIT = 1 << (LEVEL_BITS + 1);
export const NODE_FOLDED_BIT = 1 << (LEVEL_BITS + 2);
/**
 * A childful row whose subtree holds at most this many records is folded: it
 * refines exactly when its nearest unfolded ancestor does, so the subtree draws
 * as points, never as a box-filling blob. v1's fat-leaf capacity, so sparse
 * outskirts cost what they cost under SKST.
 */
export const STAR_FOLD_RECORDS = 64;
export const OWN_COUNT_SHIFT = 8;

/** Two fade channels per row, own records then blob (`opacity[i * 2 + c]`). */
export const OPACITY_CHANNELS = 2;
export const OWN_OPACITY = 0;
export const BLOB_OPACITY = 1;

/** Log-proxy budget bins (`CUT_BINS` in `cut.wesl`), plus the chosen threshold bin. */
export const CUT_BINS = 1024;
export const CUT_HIST_WORDS = CUT_BINS + 1;
/** A leaf claims blocks of `1 << LEAF_BLOCK_SHIFT` instances (`LEAF_BLOCK_SHIFT`). */
export const LEAF_BLOCK_SHIFT = 3;
/** A leaf-list entry is `node | block << LEAF_BLOCK_INDEX_SHIFT`. */
export const LEAF_BLOCK_INDEX_SHIFT = 22;
/** Pool rows the leaf-list entry can name, and pool records the pick's 26-bit index can (strict `<`). */
export const POOL_NODE_INDEX_LIMIT = 2 ** LEAF_BLOCK_INDEX_SHIFT;
export const POOL_RECORD_INDEX_LIMIT = 2 ** SELECTION_SOURCE_SHIFT;
/** Two indirect draw records (leaf, then aggregate), four u32 each. */
export const CUT_DRAWS_WORDS = 8;
/** u32 words per indirect draw record; the aggregate record follows the leaf's. */
export const DRAW_RECORD_WORDS = 4;
export const AGG_DRAW_BYTE_OFFSET = DRAW_RECORD_WORDS * WORD_BYTES;
/** Each record's vertex count: one circumscribing triangle per instance. */
const BILLBOARD_VERTEX_COUNT = 3;

/** `CUT_BINS_PER_OCTAVE`, `MIN_DIST_SQ` and `HALF_DIAGONAL` in `cut.wesl`. */
export const CUT_BINS_PER_OCTAVE = 64;
export const MIN_DIST_SQ = 1e-15;
export const HALF_DIAGONAL = 0.8660254;

/** `struct CutStream`: two u32 padded to a uniform's 16 bytes. */
export const CUT_STREAM_BYTES = 16;
export const STREAM_BLOCK_SHIFT_WORD = 0;
export const STREAM_IS_BLOB_WORD = 1;

/** Frusta one cut prunes against (`CUT_MAX_VIEWS`); more views ⇒ no prune. */
export const CUT_MAX_VIEWS = 6;
const PLANES_PER_VIEW = 6;
export const PLANE_FLOATS = 4;
/** Floats one view contributes to `planes`: six vec4 planes. */
export const FLOATS_PER_VIEW = PLANES_PER_VIEW * PLANE_FLOATS;

/**
 * `struct CutUniforms`: an 80-byte head, then the planes. Word slots of the
 * head, in the order `cutIo.wesl` declares them (words 17–19 are pad).
 */
export const CAM_CELL_INT_INDEX = 0;
export const CELL_EDGE_MPC_FLOAT_INDEX = 3;
export const CAM_FRAC_FLOAT_INDEX = 4;
export const REFINE_THRESHOLD_SQ_FLOAT_INDEX = 7;
export const FADE_STEP_FLOAT_INDEX = 8;
export const DRAW_BUDGET_U32_INDEX = 9;
export const WORLD_SPREAD_FLOAT_INDEX = 10;
export const LEAF_MARGIN_RAD_FLOAT_INDEX = 11;
export const VIEW_COUNT_U32_INDEX = 12;
export const NODE_COUNT_U32_INDEX = 13;
export const OPACITY_FLOAT_INDEX = 14;
export const INDEX_NODES_U32_INDEX = 15;
export const CHUNK_NODE_CAP_U32_INDEX = 16;
export const PLANES_FLOAT_INDEX = 20;
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

/**
 * One object's rows as `CutNode`s into `out` from row 0, `parent` and `firstRecord`
 * offset by the bases (zero for the index). A row whose parent is not in the table
 * takes `outerParent(i)`: the index root names itself, a chunk's top rows its root.
 */
function packRows(
  nodes: OctreeNodeTable,
  out: Uint32Array,
  bases: { readonly node: number; readonly record: number },
  outerParent: (i: number) => number,
  foldRecords: number,
): void {
  const isFolded = (i: number) => foldedRow(nodes, i, foldRecords);
  const n = nodes.count;
  const rowByKey = new Map<number, number>();
  for (let i = 0; i < n; i++) rowByKey.set(nodeKey(nodes.level[i]!, nodes.morton[i]!), i);
  const hasBlob = (i: number) => nodes.childMask[i] !== 0;

  const localParent = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const level = nodes.level[i]!;
    const own = nodes.ownCount[i]!;
    if (level >= 2 ** LEVEL_BITS) throw new Error(`starCut: level ${level} overflows`);
    if (own > MAX_OWN_COUNT) {
      throw new Error(`starCut: ${own} records overflow one node's block index`);
    }
    localParent[i] = rowByKey.get(parentKey(level, nodes.morton[i]!)) ?? -1;
  }

  // A folded row names its nearest unfolded ancestor as parent, so `refines`
  // reads one row's proxy, never a chain. Rows sort by level ascending, so a
  // parent's row comes after its child's and a descending pass sees it first.
  const childDrawn = new Uint32Array(n);
  for (let i = n - 1; i >= 0; i--) {
    const local = localParent[i]!;
    const o = i * CUT_NODE_WORDS + NODE_PARENT_WORD;
    if (local < 0) out[o] = outerParent(i);
    else if (isFolded(local) && isFolded(i))
      out[o] = out[local * CUT_NODE_WORDS + NODE_PARENT_WORD]!;
    else out[o] = bases.node + local;
    if (local >= 0) childDrawn[local]! += drawnOnRefine(nodes, i, foldRecords);
  }

  for (let i = 0; i < n; i++) {
    const level = nodes.level[i]!;
    // Leaf-cell units: a level-L node's own Morton cell is 2^L leaf cells wide.
    const [cx, cy, cz] = mortonDecode3(nodes.morton[i]!).map((c) => c * 2 ** level) as Vec3;
    const resident = nodes.chunkRef[i] === NO_CHUNK_REF;
    const o = i * CUT_NODE_WORDS;
    out[o + NODE_GRID_WORD] = cx | (cy << GRID_AXIS_BITS) | (cz << (2 * GRID_AXIS_BITS));
    out[o + NODE_FIRST_RECORD_WORD] = bases.record + nodes.firstRecord[i]!;
    const folded = isFolded(i);
    out[o + NODE_BITS_WORD] = rowBits(nodes, i, folded, resident);
    out[o + NODE_BLOB_COUNT_WORD] = nodes.blobCount[i]!;
    // The −1 is the row's own blob; its own records stay drawn across a refine.
    // A folded row's cost is already in its unfolded ancestor's delta.
    out[o + NODE_REFINE_DELTA_WORD] = hasBlob(i) && resident && !folded ? childDrawn[i]! - 1 : 0;
  }
}

function rowBits(nodes: OctreeNodeTable, i: number, folded: boolean, resident: boolean): number {
  return (
    nodes.level[i]! |
    (nodes.childMask[i] !== 0 ? NODE_BLOB_BIT : 0) |
    (resident ? NODE_RESIDENT_BIT : 0) |
    (folded ? NODE_FOLDED_BIT : 0) |
    (nodes.ownCount[i]! << OWN_COUNT_SHIFT)
  );
}

/**
 * A chunk root's two residency words, `bits` then `refineDelta`, into `out`: as packed
 * (unresident, delta 0) when `refineDelta` is null, else resident with it. A root never folds.
 */
export function writeChunkRootWords(
  out: Uint32Array,
  nodes: OctreeNodeTable,
  row: number,
  refineDelta: number | null,
): void {
  out[0] = rowBits(nodes, row, false, refineDelta !== null);
  out[1] = refineDelta ?? 0;
}

/** Never a chunk root: its children may be absent, and only an unfolded row reads residency. */
function foldedRow(nodes: OctreeNodeTable, i: number, foldRecords: number): boolean {
  return (
    nodes.childMask[i] !== 0 &&
    nodes.chunkRef[i] === NO_CHUNK_REF &&
    nodes.ownCount[i]! + nodes.blobCount[i]! <= foldRecords
  );
}

/** Instances a row adds when its parent refines: a folded row draws its whole subtree. */
function drawnOnRefine(nodes: OctreeNodeTable, i: number, foldRecords: number): number {
  if (foldedRow(nodes, i, foldRecords)) return nodes.ownCount[i]! + nodes.blobCount[i]!;
  return nodes.ownCount[i]! + (nodes.childMask[i] !== 0 ? 1 : 0);
}

function checkGrid(bits: number): void {
  if (bits > MAX_GRID_BITS) {
    throw new Error(`starCut: grid wider than ${2 ** GRID_AXIS_BITS} leaf cells per axis`);
  }
}

/**
 * The index's rows; a chunk root starts unresident (`refineDelta 0`) until its chunk lands.
 * `foldRecords` 0 disables the fold, for tests that pin the unfolded cut on tiny trees.
 */
export function packStarCutNodes(octree: StarOctree, foldRecords = STAR_FOLD_RECORDS): Uint32Array {
  checkGrid(octree.grid.bits);
  const out = new Uint32Array(octree.nodes.count * CUT_NODE_WORDS);
  packRows(octree.nodes, out, { node: 0, record: 0 }, (i) => i, foldRecords);
  return out;
}

/**
 * `chunkNodeCap` rows, zero-padded; parent and firstRecord pool-absolute from nodeBase/recordBase;
 * a top row's parent is its root's pool row.
 */
export function packStarChunkNodes(
  chunk: StarChunk,
  roots: readonly StarChunkRoot[],
  pool: { readonly nodeBase: number; readonly recordBase: number },
  chunkNodeCap: number,
  foldRecords = STAR_FOLD_RECORDS,
): Uint32Array {
  if (chunk.nodes.count > chunkNodeCap) {
    throw new Error(
      `starCut: chunk of ${chunk.nodes.count} rows exceeds chunkNodeCap ${chunkNodeCap}`,
    );
  }
  const out = new Uint32Array(chunkNodeCap * CUT_NODE_WORDS);
  const { level, morton } = chunk.nodes;
  const rootRowByKey = new Map(roots.map((r) => [nodeKey(r.level, r.morton), r.rootRow]));
  packRows(
    chunk.nodes,
    out,
    { node: pool.nodeBase, record: pool.recordBase },
    (i) => {
      const rootRow = rootRowByKey.get(parentKey(level[i]!, morton[i]!));
      if (rootRow === undefined) {
        throw new Error(`starCut: chunk row ${i} has no parent in the chunk and is not a top row`);
      }
      return rootRow;
    },
    foldRecords,
  );
  return out;
}

/** Each root's `refineDelta` once its chunk is resident, in `roots` order: Σ its top rows' instances − 1. */
export function chunkRootRefineDeltas(
  chunk: StarChunk,
  roots: readonly Pick<StarChunkRoot, 'level' | 'morton'>[],
  foldRecords = STAR_FOLD_RECORDS,
): number[] {
  const { nodes } = chunk;
  const rootOfKey = new Map(roots.map((r, k) => [nodeKey(r.level, r.morton), k]));
  const deltas = roots.map(() => -1);
  for (let i = 0; i < nodes.count; i++) {
    const k = rootOfKey.get(parentKey(nodes.level[i]!, nodes.morton[i]!));
    if (k !== undefined) deltas[k]! += drawnOnRefine(nodes, i, foldRecords);
  }
  return deltas;
}

function nodeKey(level: number, morton: number): number {
  return level * LEVEL_KEY_STRIDE + morton;
}

function parentKey(level: number, morton: number): number {
  return nodeKey(level + 1, Math.floor(morton / 2 ** OCTANT_BITS));
}

/** Throws, naming the largest slot count that fits, when `slots` would overflow a pool cap; never clamps. */
export function checkStarPoolCaps(octree: StarOctree, slots: number): void {
  const fit = (index: number, stride: number, limit: number) =>
    stride === 0 ? Infinity : Math.floor((limit - 1 - index) / stride);
  const fits = Math.min(
    fit(octree.nodes.count, octree.chunkNodeCap, POOL_NODE_INDEX_LIMIT),
    fit(octree.records.count, octree.chunkCapacity, POOL_RECORD_INDEX_LIMIT),
  );
  if (slots > fits) {
    const n = Math.max(0, fits);
    throw new Error(
      `star pool: ${slots} slots overflow the ${LEAF_BLOCK_INDEX_SHIFT}-bit row or ` +
        `${SELECTION_SOURCE_SHIFT}-bit record index; only ${n} slot${n === 1 ? '' : 's'} fit`,
    );
  }
}

/** Leaf-list entries the pool can ever hold: every own block of the index, and of every slot at worst. */
export function leafListCapacity(octree: StarOctree, slots: number): number {
  let blocks = 0;
  for (let i = 0; i < octree.nodes.count; i++) {
    blocks += Math.ceil(octree.nodes.ownCount[i]! / (1 << LEAF_BLOCK_SHIFT));
  }
  // ceil(own / 8) ≤ own / 8 + 1 per row, summed over a chunk's records and rows.
  return blocks + slots * (octree.chunkCapacity / (1 << LEAF_BLOCK_SHIFT) + octree.chunkNodeCap);
}

/**
 * Fill one source's `CutUniforms`. The camera splits into a whole leaf cell
 * plus a fraction HERE, in f64, so the shader's node-minus-camera is
 * integer-exact (see `cutIo.wesl`). `planes` holds `FLOATS_PER_VIEW` floats per
 * view; none means no prune.
 */
export function writeStarCutUniforms(
  out: ArrayBuffer,
  octree: StarOctree,
  pool: { readonly slots: number },
  camPosMpc: Readonly<Vec3>,
  cut: {
    readonly refineThreshold: number;
    readonly fadeStep: number;
    readonly drawBudget: number;
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
      (camPosMpc[a]! * SCALE_UNITS.MPC_TO_PC - octree.grid.origin[a]!) / octree.grid.cellEdge;
    const whole = Math.max(-CAM_CELL_LIMIT, Math.min(CAM_CELL_LIMIT, Math.floor(cells)));
    i32[CAM_CELL_INT_INDEX + a] = whole;
    f32[CAM_FRAC_FLOAT_INDEX + a] = cells - whole;
  }
  f32[CELL_EDGE_MPC_FLOAT_INDEX] = octree.grid.cellEdge * SCALE_UNITS.PC_TO_MPC;
  f32[REFINE_THRESHOLD_SQ_FLOAT_INDEX] = cut.refineThreshold * cut.refineThreshold;
  f32[FADE_STEP_FLOAT_INDEX] = cut.fadeStep;
  u32[DRAW_BUDGET_U32_INDEX] = cut.drawBudget;
  f32[WORLD_SPREAD_FLOAT_INDEX] = cut.worldSpread;
  f32[LEAF_MARGIN_RAD_FLOAT_INDEX] = cut.leafMarginRad;
  const views = cut.planes.length / FLOATS_PER_VIEW;
  const viewCount = views <= CUT_MAX_VIEWS ? views : 0;
  u32[VIEW_COUNT_U32_INDEX] = viewCount;
  u32[NODE_COUNT_U32_INDEX] = octree.nodes.count + pool.slots * octree.chunkNodeCap;
  u32[INDEX_NODES_U32_INDEX] = octree.nodes.count;
  u32[CHUNK_NODE_CAP_U32_INDEX] = octree.chunkNodeCap;
  f32[OPACITY_FLOAT_INDEX] = cut.opacity;
  f32.set(cut.planes.subarray(0, viewCount * FLOATS_PER_VIEW), PLANES_FLOAT_INDEX);
}
