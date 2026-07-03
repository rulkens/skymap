/**
 * randomGalaxyParams — port of the spike's `randomParams` method
 * (`Galaxy Renderer.dc.html:539-554`). The RNG is injected, so every case
 * here drives `mulberry32` rather than `Math.random()` — the whole point of
 * the port is that the same seed always produces the same galaxy.
 */
import { describe, expect, it } from 'vitest';
import { randomGalaxyParams } from '../../../../tools/galaxy-renderer/src/data/randomGalaxyParams';
import { PARAM_SPEC } from '../../../../tools/galaxy-renderer/src/data/paramSpec';
import { mulberry32 } from '../../../../src/utils/random/mulberry32';

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
    const params = randomGalaxyParams(mulberry32(7), { includeSize: true }) as unknown as Record<
      string,
      number
    >;

    for (const [key, spec] of Object.entries(PARAM_SPEC)) {
      // hii is exempt: PARAM_SPEC's entry ranges its *slider*, but the
      // spike's randomizer never stepped hii — it draws hii from a
      // separate, unstepped formula after the generic SPEC loop
      // (html:551, mirrored below by the explicit `hii` override that
      // wins over the loop's `sampled.hii`). Range still applies.
      const value = params[key]!;
      expect(value, key).toBeGreaterThanOrEqual(spec!.min);
      expect(value, key).toBeLessThanOrEqual(spec!.max);
      if (key === 'hii') continue;

      const steps = (value - spec!.min) / spec!.step;
      expect(Math.abs(steps - Math.round(steps)), `${key} on-step`).toBeLessThan(1e-9);
    }
  });

  it('includeSize false leaves radius and starCount undefined', () => {
    const params = randomGalaxyParams(mulberry32(3), { includeSize: false });
    expect(params.radius).toBeUndefined();
    expect(params.starCount).toBeUndefined();
  });

  it('irregular hii stays <= 0.5', () => {
    // TYPES has 14 entries (html:541); index 13 is 'Irr'. Pinning the first
    // rng() draw to 0.95 forces `(rng() * 14) | 0 === 13`, so the type pick
    // is deterministically 'Irr' while the rest of the draw stays random.
    const rng = scriptedRng(0.95, mulberry32(1));
    const params = randomGalaxyParams(rng, { includeSize: true });
    expect(params.type).toBe('Irr');
    expect(params.hii).toBeLessThanOrEqual(0.5);
  });

  it('all four seeds are integers', () => {
    const params = randomGalaxyParams(mulberry32(99), { includeSize: true });
    expect(Number.isInteger(params.seed)).toBe(true);
    expect(Number.isInteger(params.asymSeed)).toBe(true);
    expect(Number.isInteger(params.clumpSeed)).toBe(true);
    expect(Number.isInteger(params.waveSeed)).toBe(true);
  });
});
