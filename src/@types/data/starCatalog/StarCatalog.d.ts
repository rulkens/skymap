/**
 * StarCatalog — the decoded, renderer-ready star catalog.
 *
 * Where `GalaxyCatalog` is a flat struct-of-arrays of absolute-cartesian
 * floats, a star catalog is an *octree over cell-quantized 6-byte
 * records*: `nodes` is the spatial index (leaf cells + aggregate flux
 * mips) and `records` is the packed byte blob every node slices into.
 * Reconstructing a star's world position needs three things this shape
 * carries — the owning node (for its cell origin, via `mortonIndex` +
 * `level`), the grid geometry (`gridOrigin`, `cellEdgePc`,
 * `mortonBitsPerAxis`), and the record's in-cell 10-bit offsets. See
 * `starCatalogFormat.ts` for the byte layout and the pack/unpack math.
 *
 * ── Why gridOrigin is f64 while everything renderer-facing is f32 ─────────
 *
 * The heliocentric grid corner is stored (and kept here) as a Vec3 of
 * float64 because plan 03 subtracts it from the camera CPU-side *before*
 * uploading positions to the GPU. Parsec-scale coordinates far from the
 * Sun lose too much precision if that subtraction happens in float32; the
 * f64 origin is the anchor that keeps the near-camera math exact. The
 * on-disk header round-trips it losslessly for exactly this reason.
 */
import type { Vec3 } from '../../math/Vec3';
import type { StarCatalogNode } from './StarCatalogNode';

export type StarCatalog = {
  /**
   * Number of leaf star records — the real stars, excluding aggregates.
   * Stored in the header so a reader knows the population size without
   * walking the node table. NOT the length of `records`, which also
   * includes one aggregate record per interior node.
   */
  readonly starCount: number;

  /** Number of octree nodes (leaf + aggregate). Equals `nodes.length`. */
  readonly nodeCount: number;

  /**
   * Grid resolution in bits per axis (≈9 → 512³ cells). Sets how many
   * bits of each `mortonIndex` belong to x, y, and z.
   */
  readonly mortonBitsPerAxis: number;

  /** Leaf-cell edge length in parsecs — the record offsets' unit scale. */
  readonly cellEdgePc: number;

  /**
   * Grid corner in parsecs, heliocentric — the origin all cell positions
   * are measured from. Kept at float64 precision (see the module note).
   */
  readonly gridOrigin: Vec3;

  /** The octree, in on-disk order; every node slices into `records`. */
  readonly nodes: readonly StarCatalogNode[];

  /**
   * Packed record blob — `totalRecords × RECORD_BYTES` bytes, leaf stars
   * and aggregates interleaved in the order the nodes reference them.
   * `totalRecords` is not stored: it is the blob length ÷ `RECORD_BYTES`,
   * recovered on decode from the remaining buffer. Contiguous with a zero
   * byteOffset so it is GPU-upload-ready as decoded.
   */
  readonly records: Uint8Array;
};
