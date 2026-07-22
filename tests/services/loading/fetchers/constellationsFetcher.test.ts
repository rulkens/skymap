/**
 * parseConstellations — shape + version validation for the
 * `constellations.json` artifact.
 *
 * The parse step is the only part of the constellations fetcher worth a test:
 * it is the loud-failure boundary between a stale/malformed artifact and a
 * renderer that would otherwise decode garbage. The network path
 * (`makeJsonFetcher`) is a thin shared compose, covered by its own consumers;
 * these tests exercise the pure `parseConstellations` directly, no fetch mock.
 */

import { describe, it, expect } from 'vitest';
import { parseConstellations } from '../../../../src/services/loading/fetchers/constellationsFetcher';
import type { ConstellationsArtifact } from '../../../../src/@types/loading/ConstellationsArtifact';

const VALID: ConstellationsArtifact = {
  version: 1,
  constellations: [
    {
      name: 'Orion',
      labelAnchorPc: [10, 20, 30],
      segments: [{ aPc: [1, 2, 3], aAppMag: 0.4, bPc: [4, 5, 6], bAppMag: 1.6 }],
    },
    {
      name: 'Ursa Major',
      labelAnchorPc: [-5, 0, 12],
      segments: [{ aPc: [7, 8, 9], aAppMag: 1.8, bPc: [10, 11, 12], bAppMag: 2.4 }],
    },
  ],
};

describe('parseConstellations', () => {
  it('accepts a valid v1 artifact', () => {
    expect(parseConstellations(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('rejects a wrong version, naming the regenerate command', () => {
    const stale = JSON.stringify({ ...VALID, version: 2 });
    expect(() => parseConstellations(stale)).toThrow(/npm run build-stars-rs/);
  });

  it('rejects a malformed shape (non-array constellations)', () => {
    const bad = JSON.stringify({ version: 1, constellations: {} });
    expect(() => parseConstellations(bad)).toThrow();
  });
});
