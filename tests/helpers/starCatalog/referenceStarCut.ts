/**
 * referenceStarCut: the executable reference for `cut.wesl`. It runs the same
 * three steps (histogram, pickThreshold, emit) over the packed pool table
 * (index rows, then chunk rows) and the written `CutUniforms` on the CPU, so
 * tests can pin the algorithm. The two must change together; only the proxy is
 * rounded to f32. The GPU's list order is nondeterministic, this one is row order.
 */

import type { ReferenceStarCut } from './@types/ReferenceStarCut';
import {
  DRAW_BUDGET_U32_INDEX,
  CAM_CELL_INT_INDEX,
  CAM_FRAC_FLOAT_INDEX,
  CELL_EDGE_MPC_FLOAT_INDEX,
  CUT_BINS,
  CUT_BINS_PER_OCTAVE,
  CUT_NODE_WORDS,
  FADE_STEP_FLOAT_INDEX,
  GRID_AXIS_BITS,
  HALF_DIAGONAL,
  LEAF_BLOCK_INDEX_SHIFT,
  LEAF_BLOCK_SHIFT,
  LEAF_MARGIN_RAD_FLOAT_INDEX,
  BLOB_OPACITY,
  INDEX_NODES_U32_INDEX,
  LEVEL_BITS,
  MIN_DIST_SQ,
  NODE_BITS_WORD,
  NODE_BLOB_BIT,
  NODE_COUNT_U32_INDEX,
  NODE_FOLDED_BIT,
  NODE_GRID_WORD,
  NODE_PARENT_WORD,
  NODE_REFINE_DELTA_WORD,
  NODE_RESIDENT_BIT,
  OPACITY_CHANNELS,
  OWN_COUNT_SHIFT,
  OWN_OPACITY,
  PLANES_FLOAT_INDEX,
  REFINE_THRESHOLD_SQ_FLOAT_INDEX,
  VIEW_COUNT_U32_INDEX,
  WORLD_SPREAD_FLOAT_INDEX,
} from '../../../src/layers/starCatalog/render/starCutLayout';

export function referenceStarCut(
  nodes: Uint32Array,
  uniforms: ArrayBuffer,
  opacityIn: Float32Array,
): ReferenceStarCut {
  const camCell = new Int32Array(uniforms);
  const u32 = new Uint32Array(uniforms);
  const f32 = new Float32Array(uniforms);
  const nodeCount = u32[NODE_COUNT_U32_INDEX]!;
  const thresholdSq = f32[REFINE_THRESHOLD_SQ_FLOAT_INDEX]!;

  const bitsOf = (i: number) => nodes[i * CUT_NODE_WORDS + NODE_BITS_WORD]!;
  const edgeCells = (i: number) => 2 ** (bitsOf(i) & ((1 << LEVEL_BITS) - 1));
  const hasBlob = (i: number) => (bitsOf(i) & NODE_BLOB_BIT) !== 0;
  const childrenResident = (i: number) => (bitsOf(i) & NODE_RESIDENT_BIT) !== 0;
  const ownCount = (i: number) => bitsOf(i) >>> OWN_COUNT_SHIFT;
  const root = u32[INDEX_NODES_U32_INDEX]! - 1;

  const minCells = (i: number): number[] => {
    const grid = nodes[i * CUT_NODE_WORDS + NODE_GRID_WORD]!;
    return [0, 1, 2].map((a) => {
      const cell = (grid >>> (a * GRID_AXIS_BITS)) & ((1 << GRID_AXIS_BITS) - 1);
      return Math.fround(
        Math.fround(cell - camCell[CAM_CELL_INT_INDEX + a]!) - f32[CAM_FRAC_FLOAT_INDEX + a]!,
      );
    });
  };

  const proxyOf = (i: number): number => {
    const edge = edgeCells(i);
    const d2 = minCells(i).reduce((sum, lo) => {
      const d = Math.max(lo, -(lo + edge), 0);
      return sum + d * d;
    }, 0);
    return Math.fround((edge * edge) / Math.max(d2, MIN_DIST_SQ));
  };

  const binOf = (proxy: number): number => {
    const octaves = Math.log2(proxy / thresholdSq);
    return Math.floor(Math.min(Math.max(octaves * CUT_BINS_PER_OCTAVE, 0), CUT_BINS - 1));
  };

  const wantsRefine = (i: number, proxy: number) =>
    hasBlob(i) && childrenResident(i) && proxy >= thresholdSq;

  const offScreen = (i: number, isBlob: boolean): boolean => {
    const viewCount = u32[VIEW_COUNT_U32_INDEX]!;
    if (viewCount === 0) return false;
    const edge = edgeCells(i);
    const cellEdgeMpc = f32[CELL_EDGE_MPC_FLOAT_INDEX]!;
    const center = minCells(i).map((lo) => (lo + edge * 0.5) * cellEdgeMpc);
    const halfDiag = edge * cellEdgeMpc * HALF_DIAGONAL;
    const radius = isBlob
      ? halfDiag * f32[WORLD_SPREAD_FLOAT_INDEX]!
      : halfDiag + Math.hypot(...center) * f32[LEAF_MARGIN_RAD_FLOAT_INDEX]!;
    for (let v = 0; v < viewCount; v++) {
      let outside = false;
      for (let p = v * 6; p < v * 6 + 6 && !outside; p++) {
        const o = PLANES_FLOAT_INDEX + p * 4;
        const dist =
          f32[o]! * center[0]! + f32[o + 1]! * center[1]! + f32[o + 2]! * center[2]! + f32[o + 3]!;
        outside = dist < -radius;
      }
      if (!outside) return false;
    }
    return true;
  };

  // histogram
  const hist = new Array<number>(CUT_BINS).fill(0);
  for (let i = 0; i < nodeCount; i++) {
    const proxy = proxyOf(i);
    if (!wantsRefine(i, proxy) || offScreen(i, true)) continue;
    hist[binOf(proxy)]! += nodes[i * CUT_NODE_WORDS + NODE_REFINE_DELTA_WORD]!;
  }

  // pickThreshold
  const budget = u32[DRAW_BUDGET_U32_INDEX]!;
  let instances = ownCount(root) + (hasBlob(root) ? 1 : 0);
  let cutBin = 0;
  for (let b = CUT_BINS; b > 0; b--) {
    if (instances >= budget) {
      cutBin = b;
      break;
    }
    instances += hist[b - 1]!;
  }

  // emit
  const refines = (i: number) => {
    const folded = (bitsOf(i) & NODE_FOLDED_BIT) !== 0;
    const j = folded ? nodes[i * CUT_NODE_WORDS + NODE_PARENT_WORD]! : i;
    const proxy = proxyOf(j);
    return wantsRefine(j, proxy) && binOf(proxy) >= cutBin;
  };
  const fadeStep = f32[FADE_STEP_FLOAT_INDEX]!;
  const opacity = Float32Array.from(opacityIn);
  const leafEntries: number[] = [];
  const aggregates: number[] = [];
  const step = (o: number, goal: number) =>
    (opacity[o] = opacity[o]! + Math.min(Math.max(goal - opacity[o]!, -fadeStep), fadeStep));
  for (let i = 0; i < nodeCount; i++) {
    // Padding: cut.wesl rules it out by its slot's live row count; a real row is never all zero.
    if (bitsOf(i) === 0) continue;
    const parent = nodes[i * CUT_NODE_WORDS + NODE_PARENT_WORD]!;
    const drawOwn = i === root || refines(parent);
    const drawBlob = drawOwn && !refines(i);
    const ownOp = step(i * OPACITY_CHANNELS + OWN_OPACITY, drawOwn ? 1 : 0);
    const blobOp = step(i * OPACITY_CHANNELS + BLOB_OPACITY, drawBlob ? 1 : 0);
    if (blobOp > 0 && hasBlob(i) && !offScreen(i, true)) aggregates.push(i);
    if (ownOp <= 0 || ownCount(i) === 0 || offScreen(i, false)) continue;
    const blocks = (ownCount(i) + (1 << LEAF_BLOCK_SHIFT) - 1) >>> LEAF_BLOCK_SHIFT;
    for (let k = 0; k < blocks; k++) leafEntries.push(i | (k << LEAF_BLOCK_INDEX_SHIFT));
  }
  return { cutBin, opacity, leafEntries, aggregates };
}
