/**
 * shellMeshFormat — encode/decode for the `.shell` runtime asset: a
 * displaced-sphere triangle mesh baked from the Local Bubble's radius map.
 * Byte-layout contract (see comments.md), so the header stays fully spelled
 * out below rather than trimmed to the usual budget.
 *
 * Layout (little-endian):
 *
 *   ── HEADER (32 bytes) ────────────────────────────────────────────────
 *    0   4   magic        = "SHEL" (0x4c454853)
 *    4   4   version      = 1 (uint32)
 *    8   1   dtype        0 = f16 (vertex format float16x4), 1 = f32 (float32x4)
 *    9   1   frame        SCFD frame numbering, reused from
 *                         `FRAME_KIND_TO_ID`/`ID_TO_FRAME_KIND`
 *                         (scalarFieldFormat.ts) rather than redeclared
 *   10   2   reserved     zero
 *   12   4   vertexCount  uint32
 *   16   4   indexCount   uint32
 *   20  12   centrePc     float32 × 3, Sun-relative, in `frame`
 *
 *   ── VERTEX/INDEX ARRAYS ──────────────────────────────────────────────
 *   32     positions   vertexCount × 4 components (pc, centre-relative, w=1)
 *   …      normals     vertexCount × 4 components (unit, w=0)
 *   …      indices     indexCount × uint32
 *
 * Four components for both dtypes — WebGPU has no `float16x3`, and one
 * layout for both dtypes keeps "which GPUVertexFormat" a table lookup
 * (`SHELL_VERTEX_FORMAT`) rather than a branch. `32 + vertexCount·4·s` is a
 * multiple of 4 for both `s` (2 for f16, 4 for f32), so every block below the
 * header is a plain typed-array view with no padding to reason about.
 */
import type { ScalarFieldFrameKind } from '../../@types/data/volume/ScalarFieldFrameKind';
import type { ShellMesh } from '../../@types/data/shellMesh/ShellMesh';
import type { ShellMeshDtype } from '../../@types/data/shellMesh/ShellMeshDtype';
import type { Vec3 } from '../../@types/math/Vec3';
import { FRAME_KIND_TO_ID, ID_TO_FRAME_KIND } from '../volume/scalarFieldFormat';

const MAGIC = 0x4c454853; // "SHEL" little-endian
const VERSION = 1;
const HEADER_BYTES = 32;
const COMPONENTS_PER_VERTEX = 4;
const REGENERATE_HINT = 'regenerate via "npm run build-local-bubble"';

const DTYPE_TO_ID: Record<ShellMeshDtype, number> = { f16: 0, f32: 1 };
const ID_TO_DTYPE: ReadonlyArray<ShellMeshDtype> = ['f16', 'f32'];
const BYTES_PER_COMPONENT: Record<ShellMeshDtype, number> = { f16: 2, f32: 4 };

/**
 * Encode a `ShellMesh` to an ArrayBuffer. Pure — no I/O.
 *
 * Throws if positions/normals disagree in length — a malformed mesh is a
 * caller bug the decoder should never have to defend against. `vertexCount`
 * isn't part of the runtime type; the header still stores it, derived here.
 */
export function encodeShellMesh(mesh: ShellMesh): ArrayBuffer {
  if (mesh.positions.length !== mesh.normals.length) {
    throw new Error(
      `encodeShellMesh: positions length ${mesh.positions.length} does not match normals length ${mesh.normals.length}`,
    );
  }
  const componentCount = mesh.positions.length;
  const vertexCount = componentCount / COMPONENTS_PER_VERTEX;

  const bytesPerComponent = BYTES_PER_COMPONENT[mesh.dtype];
  const vertexBlockBytes = componentCount * bytesPerComponent;
  const indexCount = mesh.indices.length;
  const buf = new ArrayBuffer(HEADER_BYTES + vertexBlockBytes * 2 + indexCount * 4);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint8(8, DTYPE_TO_ID[mesh.dtype]);
  dv.setUint8(9, FRAME_KIND_TO_ID[mesh.frame]);
  dv.setUint16(10, 0, true); // reserved
  dv.setUint32(12, vertexCount, true);
  dv.setUint32(16, indexCount, true);
  dv.setFloat32(20, mesh.centrePc[0], true);
  dv.setFloat32(24, mesh.centrePc[1], true);
  dv.setFloat32(28, mesh.centrePc[2], true);

  const positionsOffset = HEADER_BYTES;
  const normalsOffset = positionsOffset + vertexBlockBytes;
  const indicesOffset = normalsOffset + vertexBlockBytes;

  if (mesh.dtype === 'f16') {
    new Uint16Array(buf, positionsOffset, componentCount).set(mesh.positions as Uint16Array);
    new Uint16Array(buf, normalsOffset, componentCount).set(mesh.normals as Uint16Array);
  } else {
    new Float32Array(buf, positionsOffset, componentCount).set(mesh.positions as Float32Array);
    new Float32Array(buf, normalsOffset, componentCount).set(mesh.normals as Float32Array);
  }
  new Uint32Array(buf, indicesOffset, indexCount).set(mesh.indices);

  return buf;
}

/** Decode an ArrayBuffer to a `ShellMesh` — views, not copies; throws on bad magic, version, dtype, frame or size, each naming the rebuild command. */
export function decodeShellMesh(buf: ArrayBuffer): ShellMesh {
  if (buf.byteLength < HEADER_BYTES) {
    throw new Error(
      `decodeShellMesh: buffer too small (${buf.byteLength} < ${HEADER_BYTES}) — ${REGENERATE_HINT}`,
    );
  }
  const dv = new DataView(buf);
  const magic = dv.getUint32(0, true);
  if (magic !== MAGIC) {
    throw new Error(
      `decodeShellMesh: bad magic 0x${magic.toString(16)} (expected SHEL) — ${REGENERATE_HINT}`,
    );
  }
  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(`decodeShellMesh: unsupported version ${version} — ${REGENERATE_HINT}`);
  }
  const dtypeId = dv.getUint8(8);
  const dtype = ID_TO_DTYPE[dtypeId];
  if (dtype === undefined) {
    throw new Error(`decodeShellMesh: unknown dtype ${dtypeId} — ${REGENERATE_HINT}`);
  }
  const frameId = dv.getUint8(9);
  const frame: ScalarFieldFrameKind | undefined = ID_TO_FRAME_KIND[frameId];
  if (frame === undefined) {
    throw new Error(`decodeShellMesh: unknown frame ${frameId} — ${REGENERATE_HINT}`);
  }
  const vertexCount = dv.getUint32(12, true);
  const indexCount = dv.getUint32(16, true);
  const centrePc: Vec3 = [
    dv.getFloat32(20, true),
    dv.getFloat32(24, true),
    dv.getFloat32(28, true),
  ];

  const bytesPerComponent = BYTES_PER_COMPONENT[dtype];
  const componentCount = vertexCount * COMPONENTS_PER_VERTEX;
  const vertexBlockBytes = componentCount * bytesPerComponent;
  const positionsOffset = HEADER_BYTES;
  const normalsOffset = positionsOffset + vertexBlockBytes;
  const indicesOffset = normalsOffset + vertexBlockBytes;

  const expectedBytes = indicesOffset + indexCount * 4;
  if (buf.byteLength !== expectedBytes) {
    throw new Error(
      `decodeShellMesh: buffer size ${buf.byteLength} does not match expected ${expectedBytes} — ${REGENERATE_HINT}`,
    );
  }

  const positions =
    dtype === 'f16'
      ? new Uint16Array(buf, positionsOffset, componentCount)
      : new Float32Array(buf, positionsOffset, componentCount);
  const normals =
    dtype === 'f16'
      ? new Uint16Array(buf, normalsOffset, componentCount)
      : new Float32Array(buf, normalsOffset, componentCount);
  const indices = new Uint32Array(buf, indicesOffset, indexCount);

  return { dtype, frame, centrePc, positions, normals, indices };
}
