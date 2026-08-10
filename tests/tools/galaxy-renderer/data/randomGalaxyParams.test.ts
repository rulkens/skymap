/**
 * randomGalaxyParams — port of the spike's `randomParams` method
 * (`Galaxy Renderer.dc.html:539-554`). The RNG is injected, so every case
 * here drives `mulberry32` rather than `Math.random()` — the whole point of
 * the port is that the same seed always produces the same galaxy.
 */
import { describe, expect, it } from 'vitest';
import {
  randomGalaxyParams,
  SLIDER_ONLY_KEYS,
} from '../../../../tools/galaxy-renderer/src/data/randomGalaxyParams';
import { GALAXY_LEGACY_PARAM_KEYS } from '../../../../tools/galaxy-renderer/src/data/galaxyLegacyParamKeys';
import { PARAM_SPEC } from '../../../../tools/galaxy-renderer/src/data/paramSpec';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';

/** Looks a flat field up on whichever bag `randomGalaxyParams` routed it to. */
function fieldOf(params: ReturnType<typeof randomGalaxyParams>, key: string): number | undefined {
  const bag = (GALAXY_LEGACY_PARAM_KEYS as ReadonlySet<string>).has(key)
    ? params.legacy
    : params.shared;
  return (bag as unknown as Record<string, number> | undefined)?.[key];
}

// Returns `first` on the very first call, then delegates every subsequent
// call to `rest` — lets a test pin one draw (e.g. the type pick) while
// leaving the rest of the sequence to a real generator.
function scriptedRng(first: number, rest: () => number): () => number {
  let usedFirst = false;
  return () => {
    if (!usedFirst) {
      usedFirst = true;
      return first;
    }
    return rest();
  };
}

describe('randomGalaxyParams', () => {
  it('is deterministic under a seeded rng', () => {
    const a = randomGalaxyParams(mulberry32(42), { includeSize: true });
    const b = randomGalaxyParams(mulberry32(42), { includeSize: true });
    expect(a).toEqual(b);
  });

  it('every sampled value is inside its PARAM_SPEC range and on-step', () => {
    const params = randomGalaxyParams(mulberry32(7), { includeSize: true });

    for (const [key, spec] of Object.entries(PARAM_SPEC)) {
      // SLIDER_ONLY_KEYS (hii + the dust-ring trio) aren't drawn by the
      // sampling loop, so they're not on-step by construction — they're
      // out of scope for this test. hii still gets its own range assertion
      // below since it's produced by a separate, unstepped draw.
      if (SLIDER_ONLY_KEYS.has(key)) continue;

      const value = fieldOf(params, key)!;
      expect(value, key).toBeGreaterThanOrEqual(spec!.min);
      expect(value, key).toBeLessThanOrEqual(spec!.max);

      const steps = (value - spec!.min) / spec!.step;
      expect(Math.abs(steps - Math.round(steps)), `${key} on-step`).toBeLessThan(1e-9);
    }

    expect(fieldOf(params, 'hii')).toBeGreaterThanOrEqual(PARAM_SPEC.hii!.min);
    expect(fieldOf(params, 'hii')).toBeLessThanOrEqual(PARAM_SPEC.hii!.max);
  });

  it('includeSize false leaves radius and starCount undefined', () => {
    const params = randomGalaxyParams(mulberry32(3), { includeSize: false });
    expect(params.shared.radius).toBeUndefined();
    expect(params.legacy?.starCount).toBeUndefined();
  });

  it('leaves the dust-ring trio undefined — the spike randomizer never sampled them', () => {
    const params = randomGalaxyParams(mulberry32(11), { includeSize: true });
    expect(params.legacy?.dustRing).toBeUndefined();
    expect(params.legacy?.dustRingWidth).toBeUndefined();
    expect(params.legacy?.dustRingStrength).toBeUndefined();
  });

  it('irregular hii stays <= 0.5', () => {
    // TYPES has 14 entries (html:541); index 13 is 'Irr'. Pinning the first
    // rng() draw to 0.95 forces `(rng() * 14) | 0 === 13`, so the type pick
    // is deterministically 'Irr' while the rest of the draw stays random.
    const rng = scriptedRng(0.95, mulberry32(1));
    const params = randomGalaxyParams(rng, { includeSize: true });
    expect(params.type).toBe('Irr');
    expect(params.legacy?.hii).toBeLessThanOrEqual(0.5);
  });

  it('all four seeds are integers', () => {
    const params = randomGalaxyParams(mulberry32(99), { includeSize: true });
    expect(Number.isInteger(params.shared.seed)).toBe(true);
    expect(Number.isInteger(params.shared.asymSeed)).toBe(true);
    expect(Number.isInteger(params.shared.clumpSeed)).toBe(true);
    expect(Number.isInteger(params.shared.waveSeed)).toBe(true);
  });
});
