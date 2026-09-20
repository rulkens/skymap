import type { StarNodeStream } from '../../../../../@types/rendering/StarNodeStream';

/**
 * Flat typed arrays, not arrays-of-objects: at star-field zoom the cut draws
 * tens of thousands of nodes EVERY frame, and a `{ nodeIndex, firstRecord,
 * recordCount }` object plus a `Vec3` origin per node — ~5 short-lived
 * objects each — measured at 10-12 ms/frame of GC churn during navigation.
 * `count` valid entries index into persistent typed arrays that GROW BY
 * DOUBLING but never shrink or reallocate steady-state (same trick
 * `walkStarOctreeCut`'s own output snapshot uses). Scalar fields index `[i]`;
 * the origin packs THREE f32 per node, indexed `[3*i + k]`.
 *
 * A stream is reused across frames — `computeStarCut` resets `count` to 0 (no
 * `resetStream` symbol: inlined at its two call sites) and refills via
 * `pushStarNode` — never reallocated except to grow.
 */

/** A fresh stream with backing arrays at `cap` node capacity (grown as needed). */
export function createStarNodeStream(cap: number): StarNodeStream {
  return {
    count: 0,
    nodeIndex: new Int32Array(cap),
    firstRecord: new Uint32Array(cap),
    recordCount: new Uint32Array(cap),
    originRelCamMpc: new Float32Array(cap * 3),
    cellScaleMpc: new Float32Array(cap),
    isAggregate: new Uint8Array(cap),
    subtreeStarCount: new Float32Array(cap),
    opacity: new Float32Array(cap),
  };
}

/**
 * Grow every backing array of `stream` to at least `min` node capacity by
 * DOUBLING (allocate new, copy live contents, swap) — the same grow-only trick
 * `walkStarOctreeCut`'s `growCut` uses. Called only when a push hits capacity, so
 * steady-state frames never reallocate.
 */
function growStream(stream: StarNodeStream, min: number): void {
  let cap = stream.nodeIndex.length;
  while (cap < min) cap *= 2;
  const nodeIndex = new Int32Array(cap);
  nodeIndex.set(stream.nodeIndex);
  stream.nodeIndex = nodeIndex;
  const firstRecord = new Uint32Array(cap);
  firstRecord.set(stream.firstRecord);
  stream.firstRecord = firstRecord;
  const recordCount = new Uint32Array(cap);
  recordCount.set(stream.recordCount);
  stream.recordCount = recordCount;
  const originRelCamMpc = new Float32Array(cap * 3);
  originRelCamMpc.set(stream.originRelCamMpc);
  stream.originRelCamMpc = originRelCamMpc;
  const cellScaleMpc = new Float32Array(cap);
  cellScaleMpc.set(stream.cellScaleMpc);
  stream.cellScaleMpc = cellScaleMpc;
  const isAggregate = new Uint8Array(cap);
  isAggregate.set(stream.isAggregate);
  stream.isAggregate = isAggregate;
  const subtreeStarCount = new Float32Array(cap);
  subtreeStarCount.set(stream.subtreeStarCount);
  stream.subtreeStarCount = subtreeStarCount;
  const opacity = new Float32Array(cap);
  opacity.set(stream.opacity);
  stream.opacity = opacity;
}

/** Append one drawn node to `stream`, growing the backing arrays if full. */
export function pushStarNode(
  stream: StarNodeStream,
  nodeIndex: number,
  firstRecord: number,
  recordCount: number,
  ox: number,
  oy: number,
  oz: number,
  cellScaleMpc: number,
  isAggregate: number,
  subtreeStarCount: number,
  opacity: number,
): void {
  const i = stream.count;
  if (i >= stream.nodeIndex.length) growStream(stream, i + 1);
  stream.nodeIndex[i] = nodeIndex;
  stream.firstRecord[i] = firstRecord;
  stream.recordCount[i] = recordCount;
  const o = i * 3;
  stream.originRelCamMpc[o] = ox;
  stream.originRelCamMpc[o + 1] = oy;
  stream.originRelCamMpc[o + 2] = oz;
  stream.cellScaleMpc[i] = cellScaleMpc;
  stream.isAggregate[i] = isAggregate;
  stream.subtreeStarCount[i] = subtreeStarCount;
  stream.opacity[i] = opacity;
  stream.count = i + 1;
}
