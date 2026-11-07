import { describe, expect, it } from 'vitest';

import { decodeStellarStreams } from '../../../src/layers/stellarStreams/catalog/utils/decodeStellarStreams';
import type { VasilievStar } from '../../../tools/streams/@types/VasilievStar';
import { buildStellarStreams } from '../../../tools/streams/buildStellarStreams';
import { galstreamsTrackFixture as track } from '../../helpers/streams/galstreamsTrackFixture';

const stars: VasilievStar[] = Array.from({ length: 50 }, (_, i) => ({
  x: 17,
  y: 2,
  z: -6,
  vx: 230,
  vy: -25,
  vz: 215,
  ra: 280 + i * 0.2,
  dec: -30,
  distanceKpc: 25 + i * 0.1,
  tStripGyr: i < 20 ? 0 : -i * 0.05,
}));
const tracks = [
  track({ name: 'Pal5', ref: 'a' }),
  track({ name: 'GD-1', ref: 'b' }),
  track({ name: 'AAU-ATLAS', ref: 'c' }),
  track({ name: 'Sagittarius', ref: 'd' }),
];

describe('buildStellarStreams', () => {
  it('the build writes a stream count equal to the meta length, Sagittarius first, slugs sorted after', () => {
    const { bin, meta } = buildStellarStreams(stars, tracks);
    const decoded = decodeStellarStreams(bin);
    expect(meta.map((m) => m.id)).toEqual(['sagittarius', 'aau-atlas', 'gd-1', 'pal5']);
    expect(decoded.streamCount).toBe(meta.length);
    const perStream = new Array<number>(meta.length).fill(0);
    for (let i = 0; i < decoded.particleCount; i++) perStream[decoded.records[i * 10 + 9]!]! += 1;
    expect(perStream).toEqual(meta.map((m) => m.particleCount));
  });

  it('the meta carries a measured [Fe/H] with its source, and none for a defaulted stream', () => {
    const { meta } = buildStellarStreams(stars, tracks);
    const byId = (id: string) => meta.find((m) => m.id === id)!;
    expect(byId('pal5').metallicity).toEqual({ feh: -1.41, ref: 'Harris 1996, 2010 ed.' });
    expect(byId('gd-1').metallicity).toBeNull();
  });

  it('the meta carries a published stellar mass with its source, and none where the table has none', () => {
    const { meta } = buildStellarStreams(stars, tracks);
    const byId = (id: string) => meta.find((m) => m.id === id)!;
    expect(byId('gd-1').stellarMass).toEqual({
      massMsun: 2e4,
      ref: 'Koposov+ 2010',
      derived: false,
    });
    expect(byId('pal5').stellarMass).toBeNull();
    expect(byId('sagittarius').stellarMass).toBeNull();
  });

  it('a rebuild over the same inputs is byte-identical', () => {
    const a = new Uint8Array(buildStellarStreams(stars, tracks).bin);
    const b = new Uint8Array(buildStellarStreams(stars, tracks).bin);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});
