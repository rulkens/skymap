/**
 * Regression: the HEALPix angular re-weight is computed against the
 * currently-loaded cloud.  After a tier swap drops or adds galaxies, the
 * weights MUST re-bake against the new (smaller / larger) cloud — never
 * carry over from the previous tier.
 *
 * This test is a structural assertion: feeding two different clouds through
 * `computeAngularWeights` produces two different weight arrays.  If a future
 * refactor caches weights in a way that survives a cloud swap (e.g. keyed
 * solely by source enum value, ignoring point-count), this test will trip.
 *
 * NOTE — signature deviation from the plan: the actual
 * `computeAngularWeights` takes a single `ComputeAngularWeightsInput`
 * object, not the `(cloud, source)` positional pair the plan sketched.
 * The plan flagged this case and said to adapt the call shape to the real
 * API; the structural assertions (length-matches-input, two-clouds-differ)
 * stand regardless.
 */

import { describe, expect, it } from 'vitest';
import { computeAngularWeights } from '../../../../src/services/engine/bake/computeAngularWeights';
import { Source } from '../../../../src/data/sources';
import { makeGalaxyCatalog } from '../../../fixtures/makeGalaxyCatalog';
import type { GalaxyCatalog } from '../../../../src/@types/data/galaxyCatalog/GalaxyCatalog';

function syntheticCloud(count: number, seedOffset: number): GalaxyCatalog {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Deterministic spread across the unit sphere at varying radii so the
    // HEALPix binning is non-trivial.  seedOffset shifts the radial pattern
    // so the two test clouds have meaningfully different shell histograms.
    const t = (i + seedOffset) / count;
    positions[i * 3 + 0] = Math.cos(t * Math.PI * 2) * (50 + t * 100);
    positions[i * 3 + 1] = Math.sin(t * Math.PI * 2) * (50 + t * 100);
    positions[i * 3 + 2] = (t - 0.5) * 200;
  }
  return makeGalaxyCatalog(count, { positions });
}

describe('computeAngularWeights — re-bake on cloud swap', () => {
  it('produces a fresh weight array sized to the new cloud', () => {
    const big = syntheticCloud(2_000, 0);
    const small = syntheticCloud(500, 0);

    const wBig = computeAngularWeights({ cloud: big, source: Source.Glade });
    const wSmall = computeAngularWeights({ cloud: small, source: Source.Glade });

    expect(wBig.length).toBe(2_000);
    expect(wSmall.length).toBe(500);
  });

  it('produces different weights for two clouds with different distributions', () => {
    const a = syntheticCloud(1_000, 0);
    const b = syntheticCloud(1_000, 333);

    const wA = computeAngularWeights({ cloud: a, source: Source.Glade });
    const wB = computeAngularWeights({ cloud: b, source: Source.Glade });

    // The arrays must differ at at least one index; if they were identical,
    // the bake would not be cloud-dependent.
    let anyDiff = false;
    for (let i = 0; i < wA.length; i++) {
      if (wA[i] !== wB[i]) {
        anyDiff = true;
        break;
      }
    }
    expect(anyDiff).toBe(true);
  });
});
