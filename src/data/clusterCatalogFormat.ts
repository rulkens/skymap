/**
 * Binary on-disk format for a `ClusterCatalog` — version 1 (CCAT).
 *
 * Encodes the MCXC cluster + MSCC supercluster catalog into a compact
 * fixed-record binary so the browser can fetch and decode it in a single
 * pass without JSON parsing overhead.  The approach mirrors
 * `galaxyCatalogFormat.ts` exactly: a 16-byte magic+version header
 * followed by fixed-size per-record blocks decoded into struct-of-arrays
 * output.
 *
 * Why a new format rather than extending `galaxyCatalogFormat`?
 *   Clusters and superclusters have fundamentally different fields (two
 *   radii, a mass/richness proxy, a category byte) and are drawn by a
 *   separate renderer pass — co-opting the galaxy record layout would
 *   waste most of its 64 bytes and couple two unrelated catalog shapes.
 *   A dedicated format stays narrow and self-documenting.
 *
 * Layout (little-endian):
 *
 *     ── HEADER (16 bytes) ──────────────────────────────────────────────────
 *     0       4     magic    = "CCAT" (0x54414343)
 *     4       4     version  = 1 (uint32)
 *     8       4     count    = number of structures (uint32)
 *     12      4     reserved = 0
 *
 *     ── PER-RECORD (28 bytes, 4-aligned) ───────────────────────────────────
 *     0       4     posX               (float32, Mpc)
 *     4       4     posY               (float32)
 *     8       4     posZ               (float32)
 *     12      4     physicalRadiusMpc  (float32)
 *     16      4     apparentRadiusMpc  (float32)
 *     20      4     significance       (float32, M500 / Nm)
 *     24      1     category           (uint8: 0=cluster, 1=supercluster)
 *     25–27   3     padding            (zeroed, reserved)
 *
 * Total file size: 16 + count × 28.
 *
 * Version mismatches fail loudly with a "please regenerate" message
 * rather than silently decoding garbage — the magic + version header is
 * the single source of truth for "do I understand this file?".
 */

import type { ClusterCatalog } from '../@types/data/ClusterCatalog';

// "CCAT" as a little-endian uint32:
//   bytes in memory order: C=0x43, C=0x43, A=0x41, T=0x54
//   uint32LE = 0x54414343
const MAGIC = 0x54414343;
const VERSION = 1;
const HEADER_BYTES = 16;
const BYTES_PER_RECORD = 28;

// Per-record field offsets relative to the start of each record block.
// All floats sit in the first 24 bytes (6 × 4), 4-aligned throughout.
// The category byte lands at offset 24; offsets 25–27 are zeroed padding.
const OFF_POS_X = 0;
const OFF_POS_Y = 4;
const OFF_POS_Z = 8;
const OFF_PHYS_R = 12;
const OFF_APP_R = 16;
const OFF_SIG = 20;
const OFF_CAT = 24;

export function encodeClusterCatalog(catalog: ClusterCatalog): ArrayBuffer {
  const { count, positions, physicalRadiusMpc, apparentRadiusMpc, significance, category } =
    catalog;

  if (positions.length !== count * 3) throw new Error('positions length mismatch');
  if (physicalRadiusMpc.length !== count) throw new Error('physicalRadiusMpc length mismatch');
  if (apparentRadiusMpc.length !== count) throw new Error('apparentRadiusMpc length mismatch');
  if (significance.length !== count) throw new Error('significance length mismatch');
  if (category.length !== count) throw new Error('category length mismatch');

  const buf = new ArrayBuffer(HEADER_BYTES + count * BYTES_PER_RECORD);
  const dv = new DataView(buf);

  // Header — four uint32 fields, little-endian throughout.
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, count, true);
  dv.setUint32(12, 0, true); // reserved

  // Per-record block.  All six float fields start at 4-byte-aligned offsets
  // within the record (0, 4, 8, 12, 16, 20), so the Float32Array overlay
  // shortcut used by galaxyCatalogFormat is available here too — we pre-
  // compute `f = byteBase / 4` once per record and index directly.
  // The category byte at offset 24 is handled through the DataView (or a
  // Uint8Array view) because Uint8 doesn't need alignment.
  const floatView = new Float32Array(buf);
  const byteView = new Uint8Array(buf);

  for (let i = 0; i < count; i++) {
    const byteBase = HEADER_BYTES + i * BYTES_PER_RECORD;

    // The header is 16 bytes = 4 float-slots, so byteBase is always
    // 4-aligned and (byteBase / 4) is an integer.
    const f = byteBase / 4;
    floatView[f + OFF_POS_X / 4] = positions[i * 3 + 0]!;
    floatView[f + OFF_POS_Y / 4] = positions[i * 3 + 1]!;
    floatView[f + OFF_POS_Z / 4] = positions[i * 3 + 2]!;
    floatView[f + OFF_PHYS_R / 4] = physicalRadiusMpc[i]!;
    floatView[f + OFF_APP_R / 4] = apparentRadiusMpc[i]!;
    floatView[f + OFF_SIG / 4] = significance[i]!;

    // Category byte at record offset 24.  The three padding bytes
    // (25–27) remain zero courtesy of ArrayBuffer zero-init — no
    // explicit write needed.
    byteView[byteBase + OFF_CAT] = category[i]!;
  }

  return buf;
}

export function decodeClusterCatalog(buf: ArrayBuffer): ClusterCatalog {
  const dv = new DataView(buf);

  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad magic — not a CCAT file');

  // Version mismatch surfaces as the documented "regenerate" error.
  // Stale .ccat files (built before this format version) trigger this on
  // every load until `npm run build-clusters` is re-run.  Keep the
  // message instructive — it is the cure.
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `unsupported cluster-catalog version: ${version} — please regenerate the .ccat via "npm run build-clusters"`,
    );
  }

  const count = dv.getUint32(8, true);

  const positions = new Float32Array(count * 3);
  const physicalRadiusMpc = new Float32Array(count);
  const apparentRadiusMpc = new Float32Array(count);
  const significance = new Float32Array(count);
  const category = new Uint8Array(count);

  const floatView = new Float32Array(buf);
  const byteView = new Uint8Array(buf);

  for (let i = 0; i < count; i++) {
    const byteBase = HEADER_BYTES + i * BYTES_PER_RECORD;
    const f = byteBase / 4;

    positions[i * 3 + 0] = floatView[f + OFF_POS_X / 4]!;
    positions[i * 3 + 1] = floatView[f + OFF_POS_Y / 4]!;
    positions[i * 3 + 2] = floatView[f + OFF_POS_Z / 4]!;
    physicalRadiusMpc[i] = floatView[f + OFF_PHYS_R / 4]!;
    apparentRadiusMpc[i] = floatView[f + OFF_APP_R / 4]!;
    significance[i] = floatView[f + OFF_SIG / 4]!;

    category[i] = byteView[byteBase + OFF_CAT]!;
    // Padding bytes 25–27 are ignored on decode.
  }

  return { count, positions, physicalRadiusMpc, apparentRadiusMpc, significance, category };
}

export function emptyClusterCatalog(): ClusterCatalog {
  return {
    count: 0,
    positions: new Float32Array(0),
    physicalRadiusMpc: new Float32Array(0),
    apparentRadiusMpc: new Float32Array(0),
    significance: new Float32Array(0),
    category: new Uint8Array(0),
  };
}
