import { describe, expect, it } from 'vitest';

import { decodeStellarStreams } from '../../../../../src/layers/stellarStreams/catalog/utils/decodeStellarStreams';
import { encodeStellarStreams } from '../../../../../src/layers/stellarStreams/catalog/utils/encodeStellarStreams';

const payload = {
  particleCount: 3,
  streamCount: 2,
  records: Float32Array.from({ length: 30 }, (_, i) => i * 0.25 - 3),
};

describe('stellar streams codec', () => {
  it('round-trips a payload byte for byte', () => {
    const decoded = decodeStellarStreams(encodeStellarStreams(payload));
    expect(decoded.particleCount).toBe(3);
    expect(decoded.streamCount).toBe(2);
    expect(Array.from(decoded.records)).toEqual(Array.from(payload.records));
  });

  it('rejects a wrong magic with a regenerate message', () => {
    const buf = encodeStellarStreams(payload);
    new DataView(buf).setUint32(0, 0x504d4b53, true);
    expect(() => decodeStellarStreams(buf)).toThrow(/npm run build-stellar-streams/);
  });

  it('rejects another version with a regenerate message', () => {
    const buf = encodeStellarStreams(payload);
    new DataView(buf).setUint32(4, 2, true);
    expect(() => decodeStellarStreams(buf)).toThrow(/version 2.*npm run build-stellar-streams/);
  });

  it('rejects a byte length that disagrees with particleCount', () => {
    const buf = encodeStellarStreams(payload);
    new DataView(buf).setUint32(8, 4, true);
    expect(() => decodeStellarStreams(buf)).toThrow(/disagrees with 4 particles/);
  });
});
