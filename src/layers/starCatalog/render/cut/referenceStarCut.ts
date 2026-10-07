/**
 * referenceStarCut: the executable reference for `cut.wesl`. It runs the same
 * three steps (histogram, pickThreshold, emit) over the packed node table and
 * the written `CutUniforms` on the CPU, so tests can pin the algorithm. The two
 * must change together; only the proxy is rounded to f32. The GPU's list order
 * is nondeterministic, this one is node order.
 */

import type { ReferenceStarCut } from '../../@types/ReferenceStarCut';
import {
  BUDGET_TYPICAL_U32_INDEX,
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
  LEVEL_BITS,
  MIN_DIST_SQ,
  NODE_BITS_WORD,
  NODE_COUNT_U32_INDEX,
  NODE_GRID_WORD,
  NODE_PARENT_WORD,
  NODE_REFINE_DELTA_WORD,
  PLANES_FLOAT_INDEX,
  RECORD_COUNT_SHIFT,
  REFINE_THRESHOLD_SQ_FLOAT_INDEX,
  VIEW_COUNT_U32_INDEX,
  WORLD_SPREAD_FLOAT_INDEX,
} from '../starCutLayout';

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
  const isAggregate = (i: number) => (bitsOf(i) & (1 << LEVEL_BITS)) !== 0;
  const recordCount = (i: number) => bitsOf(i) >>> RECORD_COUNT_SHIFT;

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

  const wantsRefine = (i: number, proxy: number) => isAggregate(i) && proxy >= thresholdSq;

  const offScreen = (i: number): boolean => {
    const viewCount = u32[VIEW_COUNT_U32_INDEX]!;
    if (viewCount === 0) return false;
    const edge = edgeCells(i);
    const cellEdgeMpc = f32[CELL_EDGE_MPC_FLOAT_INDEX]!;
    const center = minCells(i).map((lo) => (lo + edge * 0.5) * cellEdgeMpc);
    const halfDiag = edge * cellEdgeMpc * HALF_DIAGONAL;
    const radius = isAggregate(i)
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
    if (!wantsRefine(i, proxy) || offScreen(i)) continue;
    hist[binOf(proxy)]! += nodes[i * CUT_NODE_WORDS + NODE_REFINE_DELTA_WORD]!;
  }

  // pickThreshold
  const budget = u32[BUDGET_TYPICAL_U32_INDEX]!;
  let instances = recordCount(nodeCount - 1);
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
    const proxy = proxyOf(i);
    return wantsRefine(i, proxy) && binOf(proxy) >= cutBin;
  };
  const fadeStep = f32[FADE_STEP_FLOAT_INDEX]!;
  const opacity = Float32Array.from(opacityIn);
  const leafEntries: number[] = [];
  const aggregates: number[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const parent = nodes[i * CUT_NODE_WORDS + NODE_PARENT_WORD]!;
    const inCut = (parent === i || refines(parent)) && !refines(i);
    const goal = inCut ? 1 : 0;
    const op = opacity[i]! + Math.min(Math.max(goal - opacity[i]!, -fadeStep), fadeStep);
    opacity[i] = op;
    if (op <= 0 || offScreen(i)) continue;
    if (isAggregate(i)) {
      aggregates.push(i);
      continue;
    }
    const blocks = (recordCount(i) + (1 << LEAF_BLOCK_SHIFT) - 1) >>> LEAF_BLOCK_SHIFT;
    for (let k = 0; k < blocks; k++) leafEntries.push(i | (k << LEAF_BLOCK_INDEX_SHIFT));
  }
  return { cutBin, opacity, leafEntries, aggregates };
}
