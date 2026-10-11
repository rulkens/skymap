/**
 * Brightness stratification (spec §3): a record lives at the level its magnitude earns, in the
 * node whose box holds it; every ancestor to the root is a row; a node with children carries one
 * blob record standing for all its strict-descendant records. Blob sums run in f64 over the
 * input values, so own + blob conserves flux node by node.
 * Typed arrays throughout: the Gaia bake holds ~17 M records and V8 caps a Map or Set at 2^24.
 */
import type { OctreeNodeTable } from '../../src/@types/octree/OctreeNodeTable';
import type { OctreeBuildInput } from '../@types/octree/OctreeBuildInput';
import type { StratifiedOctree } from '../@types/octree/StratifiedOctree';
import { MAX_GRID_BITS, NO_CHUNK_REF } from '../../src/data/octree/octreeFormat';
import { mortonDecode3 } from '../../src/utils/math/mortonDecode3';
import { mortonEncode3 } from '../../src/utils/math/mortonEncode3';
import { aggregateMeanAbsMag, fluxFromAbsMag } from '../stars/mergeFluxAggregate';
import { COLUMN_AGGREGATE } from './columnAggregate';
import { levelForMagnitude } from './levelForMagnitude';

/** `level·2^30 + morton` sorts as (level, morton), the row order; exact far below 2^53. */
const LEVEL_KEY_STRIDE = 2 ** 30;
const OCTANTS = 8;
const OCTANT_BITS = 3;
const OCTANT_MASK = 0b111;
const AXES = 3;

export function stratifyOctree(input: OctreeBuildInput): StratifiedOctree {
  const { grid, stratify, positions, magnitudeColumn, columns, schema } = input;
  if (grid.bits > MAX_GRID_BITS) {
    throw new Error(
      `grid.bits ${grid.bits} exceeds ${MAX_GRID_BITS}: Morton keys must fit 30 bits`,
    );
  }
  const mags = columns.get(magnitudeColumn);
  if (mags === undefined) throw new Error(`magnitude column '${magnitudeColumn}' is missing`);
  const n = mags.length;
  const maxCell = 2 ** grid.bits - 1;

  const keys = new Float64Array(n);
  for (let r = 0; r < n; r++) {
    const level = levelForMagnitude(mags[r]!, stratify, grid);
    const x = cellOf(positions[AXES * r]!, grid.cellEdge, maxCell);
    const y = cellOf(positions[AXES * r + 1]!, grid.cellEdge, maxCell);
    const z = cellOf(positions[AXES * r + 2]!, grid.cellEdge, maxCell);
    keys[r] = level * LEVEL_KEY_STRIDE + (mortonEncode3(x, y, z) >>> (OCTANT_BITS * level));
  }
  const order = new Uint32Array(n);
  for (let r = 0; r < n; r++) order[r] = r;
  order.sort((a, b) => keys[a]! - keys[b]! || a - b);

  const owners: number[][] = Array.from({ length: grid.bits + 1 }, () => []);
  for (let q = 0; q < n; q++) {
    const k = keys[order[q]!]!;
    if (q === 0 || k !== keys[order[q - 1]!]) {
      owners[Math.floor(k / LEVEL_KEY_STRIDE)]!.push(k % LEVEL_KEY_STRIDE);
    }
  }

  // Each level's rows: its owners plus the parents of the level below, sorted and unique.
  const levelNodes: Uint32Array[] = [];
  for (let l = 0; l <= grid.bits; l++) {
    const own = owners[l]!;
    const below = levelNodes[l - 1] ?? new Uint32Array(0);
    const merged = new Uint32Array(own.length + below.length);
    merged.set(own);
    for (let j = 0; j < below.length; j++) merged[own.length + j] = below[j]! >>> OCTANT_BITS;
    merged.sort();
    let u = 0;
    for (let j = 0; j < merged.length; j++) {
      if (u === 0 || merged[j] !== merged[u - 1]) merged[u++] = merged[j]!;
    }
    levelNodes.push(merged.slice(0, u));
  }

  const levelStart = [0];
  for (const rows of levelNodes) levelStart.push(levelStart[levelStart.length - 1]! + rows.length);
  const count = levelStart[levelStart.length - 1]!;
  const nodes: OctreeNodeTable = {
    count,
    morton: new Uint32Array(count),
    level: new Uint8Array(count),
    childMask: new Uint8Array(count),
    firstRecord: new Uint32Array(count),
    ownCount: new Uint32Array(count),
    blobCount: new Uint32Array(count),
    chunkRef: new Uint32Array(count).fill(NO_CHUNK_REF),
  };
  levelNodes.forEach((rows, l) => {
    nodes.morton.set(rows, levelStart[l]);
    nodes.level.fill(l, levelStart[l], levelStart[l + 1]);
  });

  const childIndex = new Int32Array(count * OCTANTS).fill(-1);
  let blobs = 0;
  for (let l = 1; l <= grid.bits; l++) {
    const children = levelNodes[l - 1]!;
    const parents = levelNodes[l]!;
    let p = 0;
    for (let j = 0; j < children.length; j++) {
      while (parents[p] !== children[j]! >>> OCTANT_BITS) p++;
      const row = levelStart[l]! + p;
      const octant = children[j]! & OCTANT_MASK;
      if (nodes.childMask[row] === 0) blobs++;
      nodes.childMask[row]! |= 1 << octant;
      childIndex[row * OCTANTS + octant] = levelStart[l - 1]! + j;
    }
  }

  const records = n + blobs;
  const builders = schema.map((c) => {
    const aggregate = COLUMN_AGGREGATE[c.id];
    const width = aggregate === 'fluxCentroid' ? AXES : 1;
    const source = aggregate === 'fluxCentroid' ? undefined : columns.get(c.id);
    if (aggregate !== 'fluxCentroid' && source === undefined) {
      throw new Error(`column '${c.id}' has no input values`);
    }
    const sums = Array.from({ length: width }, () => new Float64Array(count));
    return { id: c.id, aggregate, source, out: new Float32Array(records * width), sums };
  });
  // Subtree totals per row: flux, real-record count, and each builder's `sums`.
  const subFlux = new Float64Array(count);
  const subCount = new Uint32Array(count);

  let q = 0;
  let rec = 0;
  for (let i = 0; i < count; i++) {
    const level = nodes.level[i]!;
    const edge = grid.cellEdge * 2 ** level;
    const box = mortonDecode3(nodes.morton[i]!).map((c) => c * edge);
    const key = level * LEVEL_KEY_STRIDE + nodes.morton[i]!;
    let own = 0;
    while (q + own < n && keys[order[q + own]!] === key) own++;
    nodes.firstRecord[i] = rec;
    nodes.ownCount[i] = own;

    // Children first: until the own records land, row i's totals ARE the blob's.
    if (nodes.childMask[i] !== 0) {
      for (let o = 0; o < OCTANTS; o++) {
        const c = childIndex[i * OCTANTS + o]!;
        if (c < 0) continue;
        subFlux[i]! += subFlux[c]!;
        subCount[i]! += subCount[c]!;
        for (const b of builders) for (const s of b.sums) s[i]! += s[c]!;
      }
      const at = rec + own;
      for (const b of builders) {
        if (b.aggregate === 'fluxCentroid') {
          for (let a = 0; a < AXES; a++) {
            b.out[AXES * at + a] = (b.sums[a]![i]! / subFlux[i]! - box[a]!) / edge;
          }
        } else if (b.aggregate === 'fluxMeanMagnitude') {
          b.out[at] = aggregateMeanAbsMag({ totalFlux: b.sums[0]![i]!, starCount: subCount[i]! });
        } else {
          b.out[at] = b.sums[0]![i]! / subFlux[i]!;
        }
      }
      nodes.blobCount[i] = subCount[i]!;
    }

    for (let k = 0; k < own; k++, rec++) {
      const r = order[q + k]!;
      const flux = fluxFromAbsMag(mags[r]!);
      for (const b of builders) {
        if (b.aggregate === 'fluxCentroid') {
          for (let a = 0; a < AXES; a++) {
            const p = positions[AXES * r + a]!;
            b.out[AXES * rec + a] = (p - box[a]!) / edge;
            b.sums[a]![i]! += flux * p;
          }
        } else {
          const v = b.source![r]!;
          b.out[rec] = v;
          b.sums[0]![i]! += b.aggregate === 'fluxMeanMagnitude' ? fluxFromAbsMag(v) : flux * v;
        }
      }
      subFlux[i]! += flux;
      subCount[i]!++;
    }
    q += own;
    if (nodes.childMask[i] !== 0) rec++;
  }

  return { nodes, columns: new Map(builders.map((b) => [b.id, b.out])), childIndex };
}

function cellOf(p: number, cellEdge: number, maxCell: number): number {
  return Math.min(Math.max(Math.floor(p / cellEdge), 0), maxCell);
}
