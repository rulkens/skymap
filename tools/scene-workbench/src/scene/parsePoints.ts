/**
 * Decodes `points.bin` (spec §5) in the browser. Returns the record array
 * as a **view** onto the downloaded buffer — task 14's GPU upload uses this
 * layout verbatim as an instance buffer, so a copy here would exist only
 * to be identical. No Node imports: this runs in the viewer, not the bake.
 */
import {
  POINTS_MAGIC,
  POINTS_FORMAT_VERSION,
  POINTS_HEADER_BYTES,
  POINTS_RECORD_BYTES,
} from '../../../scene-recon/pack/pointCloudFormat';

export type ParsedPointCloud = {
  readonly pointCount: number;
  /** The record array verbatim — uploaded as an instance buffer, stride 16, no CPU copy. */
  readonly records: Uint8Array;
};

export function parsePoints(buffer: ArrayBuffer): ParsedPointCloud {
  if (buffer.byteLength < POINTS_HEADER_BYTES) {
    throw new Error(
      `parsePoints: buffer is ${buffer.byteLength} bytes, too short for the ` +
        `${POINTS_HEADER_BYTES}-byte header — truncated download?`,
    );
  }

  const dv = new DataView(buffer);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== POINTS_MAGIC) {
    throw new Error(`parsePoints: bad magic "${magic}" — expected "${POINTS_MAGIC}"`);
  }

  const formatVersion = dv.getUint32(4, true);
  if (formatVersion !== POINTS_FORMAT_VERSION) {
    throw new Error(
      `parsePoints: unsupported formatVersion ${formatVersion} — expected ` +
        `${POINTS_FORMAT_VERSION}, re-run the bake`,
    );
  }

  const pointCount = dv.getUint32(8, true);
  const expectedBytes = POINTS_HEADER_BYTES + pointCount * POINTS_RECORD_BYTES;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `parsePoints: buffer is ${buffer.byteLength} bytes but pointCount ${pointCount} ` +
        `implies ${expectedBytes} — truncated or corrupt download`,
    );
  }

  const records = new Uint8Array(buffer, POINTS_HEADER_BYTES, pointCount * POINTS_RECORD_BYTES);
  return { pointCount, records };
}
