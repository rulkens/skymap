/**
 * filamentBinaryFormat — encode/decode for the `filaments.bin` runtime asset.
 *
 * Layout (little-endian):
 *
 *   ── HEADER (16 bytes) ────────────────────────────────────────────────
 *   0       4     magic    = "FILA" (0x414c4946)
 *   4       4     version  = 1 (uint32)
 *   8       4     stripCount    (uint32)
 *   12      4     vertexCount   (uint32)
 *
 *   ── STRIP-OFFSET TABLE (stripCount+1 × 4 bytes) ──────────────────────
 *   stripOffsets[0..stripCount] : uint32
 *
 *   ── VERTEX ARRAY (vertexCount × 16 bytes) ────────────────────────────
 *   vertices[i] = [x, y, z, density] : float32 × 4
 *
 * The +1 in the strip-offset table is the standard "exclusive scan"
 * convention — `stripOffsets[i]` is the starting vertex index of strip i,
 * `stripOffsets[i+1]` is one past its last vertex.  Lookups don't need
 * a bounds check.
 *
 * Why a separate format from GalaxyCatalog?  Filaments are variable-length
 * polylines, not fixed records.  Forcing them into the v4 GalaxyCatalog
 * shape would either truncate strips or pad them — either way wasting
 * bytes.  A bespoke format with a strip-offset table is ~10% smaller
 * AND simpler to render with `pass.draw(6, instanceCount)`.
 */

import type { FilamentCloud } from '../../@types/data/filament/FilamentCloud';

const MAGIC = 0x414c4946; // "FILA" little-endian
const VERSION = 1;
const HEADER_BYTES = 16;
const FLOATS_PER_VERTEX = 4;
const BYTES_PER_VERTEX = FLOATS_PER_VERTEX * 4;

// Version-stamped folder: max-age=86400 lets a CDN serve an old .bin
// alongside new code for up to a day, so the epoch has to live in the
// path itself to make that pairing impossible (images/earth-tiles/'s
// TILE_PREFIX precedent).
export const FILAMENT_DATA_PREFIX = `filament/v${VERSION}`;

/**
 * Encode a `FilamentCloud` to an ArrayBuffer.  Pure — no I/O.
 *
 * Throws on length-mismatch errors that indicate a malformed cloud
 * (caller bug); the runtime decoder must be able to round-trip whatever
 * we emit here without re-validating.
 */
export function encodeFilaments(cloud: FilamentCloud): ArrayBuffer {
  if (cloud.stripOffsets.length !== cloud.stripCount + 1) {
    throw new Error(
      `encodeFilaments: stripOffsets length ${cloud.stripOffsets.length} ` +
        `does not equal stripCount+1 = ${cloud.stripCount + 1}`,
    );
  }
  if (cloud.vertices.length !== cloud.vertexCount * FLOATS_PER_VERTEX) {
    throw new Error(
      `encodeFilaments: vertices length ${cloud.vertices.length} does not ` +
        `equal vertexCount × 4 = ${cloud.vertexCount * FLOATS_PER_VERTEX}`,
    );
  }
  const offsetTableBytes = (cloud.stripCount + 1) * 4;
  const vertexBytes = cloud.vertexCount * BYTES_PER_VERTEX;
  const buf = new ArrayBuffer(HEADER_BYTES + offsetTableBytes + vertexBytes);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, cloud.stripCount, true);
  dv.setUint32(12, cloud.vertexCount, true);

  // Strip-offset table is contiguous after the header.
  const offsetView = new Uint32Array(buf, HEADER_BYTES, cloud.stripCount + 1);
  offsetView.set(cloud.stripOffsets);

  // Vertex array follows the offset table.
  const vertexView = new Float32Array(
    buf,
    HEADER_BYTES + offsetTableBytes,
    cloud.vertexCount * FLOATS_PER_VERTEX,
  );
  vertexView.set(cloud.vertices);

  return buf;
}

/**
 * Decode an ArrayBuffer to a `FilamentCloud`.  Throws on bad magic or
 * unsupported version; the version error message points at the build
 * script so users can re-run with a single command.
 */
export function decodeFilaments(buf: ArrayBuffer): FilamentCloud {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) {
    throw new Error('decodeFilaments: bad magic — not a FILA file');
  }
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `decodeFilaments: unsupported version ${version} — please regenerate ` +
        `via "npm run build-filaments"`,
    );
  }
  const stripCount = dv.getUint32(8, true);
  const vertexCount = dv.getUint32(12, true);

  const offsetTableBytes = (stripCount + 1) * 4;
  const stripOffsets = new Uint32Array(stripCount + 1);
  stripOffsets.set(new Uint32Array(buf, HEADER_BYTES, stripCount + 1));

  const vertices = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
  vertices.set(
    new Float32Array(buf, HEADER_BYTES + offsetTableBytes, vertexCount * FLOATS_PER_VERTEX),
  );

  return { stripCount, vertexCount, stripOffsets, vertices };
}
