import { describe, expect, it } from 'vitest';

import type { SampledTrack } from '../../../src/@types/scene/SampledTrack';
import { parseSampledTracks } from '../../../src/services/bodies/parseSampledTracks';
import { writeSampledTracks } from '../../../tools/utils/io/writeSampledTracks';

const track = (id: string, n: number, seed: number): SampledTrack => ({
  id,
  tDays: Float64Array.from({ length: n }, (_, i) => 2444000.5 + i + seed),
  posKm: Float64Array.from({ length: 3 * n }, (_, i) => seed * 1e9 + i * 1234.5678),
  velKmS: Float32Array.from({ length: 3 * n }, (_, i) => seed + i * 0.25),
});

describe('parseSampledTracks', () => {
  it('round-trips writeSampledTracks', () => {
    const tracks = [track('probe-7', 3, 1), track('voyager2', 5, 2)];
    const bytes = writeSampledTracks(tracks);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const parsed = parseSampledTracks(buf as ArrayBuffer);
    expect(parsed.map((t) => t.id)).toEqual(['probe-7', 'voyager2']);
    parsed.forEach((p, k) => {
      expect(Array.from(p.tDays)).toEqual(Array.from(tracks[k]!.tDays));
      expect(Array.from(p.posKm)).toEqual(Array.from(tracks[k]!.posKm));
      expect(Array.from(p.velKmS)).toEqual(Array.from(tracks[k]!.velKmS));
    });
  });

  it('throws on a wrong magic', () => {
    const bytes = writeSampledTracks([track('voyager1', 2, 1)]);
    bytes[0] = 0x58;
    expect(() => parseSampledTracks(bytes.buffer as ArrayBuffer)).toThrow(/magic/);
  });

  it('throws on a wrong version', () => {
    const bytes = writeSampledTracks([track('voyager1', 2, 1)]);
    bytes[4] = 2;
    expect(() => parseSampledTracks(bytes.buffer as ArrayBuffer)).toThrow(/version/);
  });

  it('throws "truncated" on a cut buffer', () => {
    const bytes = writeSampledTracks([track('voyager1', 4, 1)]);
    for (const len of [8, 20, bytes.length - 8])
      expect(() => parseSampledTracks(bytes.buffer.slice(0, len) as ArrayBuffer)).toThrow(
        /truncated/,
      );
  });
});
