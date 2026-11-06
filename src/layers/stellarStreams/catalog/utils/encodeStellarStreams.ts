import type { StellarStreamsPayload } from '../@types/StellarStreamsPayload';
import {
  STELLAR_STREAMS_HEADER_BYTES,
  STELLAR_STREAMS_MAGIC,
  STELLAR_STREAMS_RECORD_F32,
  STELLAR_STREAMS_VERSION,
} from '../data/stellarStreamsFormat.constants';

export function encodeStellarStreams(p: StellarStreamsPayload): ArrayBuffer {
  if (p.records.length !== p.particleCount * STELLAR_STREAMS_RECORD_F32) {
    throw new Error(
      `encodeStellarStreams: ${p.records.length} floats for ${p.particleCount} particles`,
    );
  }
  const buf = new ArrayBuffer(STELLAR_STREAMS_HEADER_BYTES + p.records.byteLength);
  const dv = new DataView(buf);
  dv.setUint32(0, STELLAR_STREAMS_MAGIC, true);
  dv.setUint32(4, STELLAR_STREAMS_VERSION, true);
  dv.setUint32(8, p.particleCount, true);
  dv.setUint32(12, p.streamCount, true);
  // Float32Array writes in platform order; every WebGPU host (and Node's) is little-endian.
  new Float32Array(buf, STELLAR_STREAMS_HEADER_BYTES).set(p.records);
  return buf;
}
