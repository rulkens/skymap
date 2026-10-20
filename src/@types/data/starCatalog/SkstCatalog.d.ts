/**
 * SkstCatalog — a decoded SKST v1 star catalog; `starOctreeFromSkst` adapts it to `Octree`.
 *
 * An octree over cell-quantized 6-byte records: `nodes` is the spatial index
 * (leaf cells + aggregate flux mips), `records` the packed blob they slice into.
 * See `starCatalogFormat.ts` for the byte layout.
 *
 * `gridOrigin` is f64 because the camera is subtracted from it CPU-side before
 * upload: parsec-scale coordinates lose too much precision in float32.
 */
import type { Vec3 } from '../../math/Vec3';
import type { SkstNode } from './SkstNode';

export type SkstCatalog = {
  /** Leaf star records only; NOT the length of `records`, which also holds one aggregate per interior node. */
  readonly starCount: number;

  /** Number of octree nodes (leaf + aggregate). Equals `nodes.length`. */
  readonly nodeCount: number;

  /** Bits per axis of each `mortonIndex` (≈9 → 512³ cells). */
  readonly mortonBitsPerAxis: number;

  /** Leaf-cell edge length in parsecs — the record offsets' unit scale. */
  readonly cellEdgePc: number;

  /** Grid corner in parsecs, heliocentric, at float64. */
  readonly gridOrigin: Vec3;

  /** The octree, in on-disk order; every node slices into `records`. */
  readonly nodes: readonly SkstNode[];

  /** Packed blob, `blob length / RECORD_BYTES` records (not stored), zero byteOffset so it uploads as decoded. */
  readonly records: Uint8Array;
};
