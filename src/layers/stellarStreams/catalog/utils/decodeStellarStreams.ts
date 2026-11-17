import type { StellarStreamsPayload } from '../@types/StellarStreamsPayload';
import {
  STELLAR_STREAMS_HEADER_BYTES,
  STELLAR_STREAMS_MAGIC,
  STELLAR_STREAMS_RECORD_F32,
  STELLAR_STREAMS_VERSION,
} from '../data/stellarStreamsFormat.constants';

const REGENERATE = 'please regenerate it via `npm run build-stellar-streams`';

/** Zero-copy: `records` views `buf`, ready for a GPU upload. */
export function decodeStellarStreams(buf: ArrayBuffer): StellarStreamsPayload {
  if (buf.byteLength < STELLAR_STREAMS_HEADER_BYTES) {
    throw new Error(`stellar-streams.bin: ${buf.byteLength} bytes is shorter than its header`);
  }
  const dv = new DataView(buf);
  const magic = dv.getUint32(0, true);
  if (magic !== STELLAR_STREAMS_MAGIC) {
    throw new Error(`stellar-streams.bin: bad magic 0x${magic.toString(16)} — ${REGENERATE}`);
  }
  const version = dv.getUint32(4, true);
  if (version !== STELLAR_STREAMS_VERSION) {
    throw new Error(
      `stellar-streams.bin: version ${version}, expected ${STELLAR_STREAMS_VERSION} — ${REGENERATE}`,
    );
  }
  const particleCount = dv.getUint32(8, true);
  const streamCount = dv.getUint32(12, true);
  const floats = particleCount * STELLAR_STREAMS_RECORD_F32;
  if (buf.byteLength !== STELLAR_STREAMS_HEADER_BYTES + floats * 4) {
    throw new Error(
      `stellar-streams.bin: ${buf.byteLength} bytes disagrees with ${particleCount} particles — ${REGENERATE}`,
    );
  }
  const records = new Float32Array(buf, STELLAR_STREAMS_HEADER_BYTES, floats);
  return { particleCount, streamCount, records };
}
