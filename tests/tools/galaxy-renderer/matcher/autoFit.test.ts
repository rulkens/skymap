/**
 * autoFit — coordinate-descent optimiser driving a `GalaxyEngineHandle`
 * toward a reference descriptor. Rather than mocking `computeDescriptor`
 * away, these tests drive a scripted fake engine whose `grab()` paints a
 * tiny synthetic blob (via the same gaussian-blob technique as
 * computeDescriptor.test.ts) that gets rounder — and so has lower loss
 * against a round reference — the closer `bulgeSize`/`armCount` land on a
 * known target. That gives every run a genuine, known-minimum loss surface
 * without needing a real render.
 */
import { describe, expect, it, vi } from 'vitest';
import { autoFit } from '../../../../tools/galaxy-renderer/src/matcher/autoFit';
import { computeDescriptor } from '../../../../tools/galaxy-renderer/src/matcher/computeDescriptor';
import type { GalaxyEngineHandle } from '../../../../tools/galaxy-renderer/@types/engine/GalaxyEngineHandle';
import type { GalaxyParams } from '../../../../src/@types/galaxy/GalaxyParams';

const SIZE = 40; // small frame — keeps the descriptor pixel loop fast

/** Allocate an all-black opaque RGBA frame (a "dead" render). */
function blackFrame(size: number): Uint8ClampedArray {
  return new Uint8ClampedArray(size * size * 4);
}

/** Paint a centred grayscale gaussian blob — rounder (higher q) the smaller `dev`. */
function blobForDeviation(size: number, dev: number): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(size * size * 4);
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const sigmaX = 6 + dev * 10;
  const sigmaY = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const ddx = (x - cx) / sigmaX;
      const ddy = (y - cy) / sigmaY;
      const v = Math.min(255, 180 * Math.exp(-0.5 * (ddx * ddx + ddy * ddy)));
      const j = (y * size + x) * 4;
      buf[j] = v;
      buf[j + 1] = v;
      buf[j + 2] = v;
      buf[j + 3] = 255;
    }
  }
  return buf;
}

const TARGET_BULGE = 1.0;
const TARGET_ARMS = 3;

/** Deviation from the known optimum — 0 at the target, growing with distance. */
function deviation(p: GalaxyParams): number {
  const bulge = p.bulgeSize ?? 1;
  const arms = p.armCount ?? 2;
  return Math.abs(bulge - TARGET_BULGE) + 0.15 * Math.abs(arms - TARGET_ARMS);
}

const REFERENCE = computeDescriptor(blobForDeviation(SIZE, 0), SIZE)!;

const SEED: GalaxyParams = {
  type: 'Sc',
  starCount: 50000,
  bulgeSize: 0.2,
  armCount: 6,
  armWinding: 0.5,
  armWidth: 1,
  armStrength: 1,
  spriteDust: 1,
  hii: 1,
  youngStars: 0.5,
  diskThickness: 1,
};

/** A scripted fake engine: `grab()` paints the blob for whatever params
 * `setParams` last saw. `blackOnCall` optionally forces one call number
 * (1-indexed) to return a dead (all-black, null-descriptor) frame instead. */
function makeFakeEngine(blackOnCall?: number): {
  engine: GalaxyEngineHandle;
  setParams: ReturnType<typeof vi.fn<GalaxyEngineHandle['setParams']>>;
  grab: ReturnType<typeof vi.fn<GalaxyEngineHandle['grab']>>;
} {
  let last: GalaxyParams = SEED;
  let grabCalls = 0;

  const setParams = vi.fn<GalaxyEngineHandle['setParams']>(async (p) => {
    last = p;
  });
  const grab = vi.fn<GalaxyEngineHandle['grab']>(async (size = SIZE) => {
    grabCalls++;
    if (blackOnCall && grabCalls === blackOnCall) {
      return { S: size, data: blackFrame(size) };
    }
    return { S: size, data: blobForDeviation(size, deviation(last)) };
  });

  const engine: GalaxyEngineHandle = {
    setParams,
    setRender: vi.fn<GalaxyEngineHandle['setRender']>(),
    setFieldTuning: vi.fn<GalaxyEngineHandle['setFieldTuning']>(),
    setView: vi.fn<GalaxyEngineHandle['setView']>(),
    setAutoRotate: vi.fn<GalaxyEngineHandle['setAutoRotate']>(),
    setInsets: vi.fn<GalaxyEngineHandle['setInsets']>(),
    setExtras: vi.fn<GalaxyEngineHandle['setExtras']>(async () => {}),
    step: vi.fn<GalaxyEngineHandle['step']>(),
    sample: vi.fn<GalaxyEngineHandle['sample']>(async () => ({
      mean: 0,
      max: 0,
      litPct: 0,
      stars: 0,
    })),
    grab,
    getCamera: vi.fn<GalaxyEngineHandle['getCamera']>(() => ({ az: 0, el: 0, dist: 1 })),
    getIsmMapTexture: vi.fn<GalaxyEngineHandle['getIsmMapTexture']>(),
    getIsmMapData: vi.fn<GalaxyEngineHandle['getIsmMapData']>(),
    dispose: vi.fn<GalaxyEngineHandle['dispose']>(),
  };
  return { engine, setParams, grab };
}

describe('autoFit', () => {
  it('loss history is non-increasing, and the final loss is at or below the start', async () => {
    const { engine } = makeFakeEngine();
    const result = await autoFit(engine, REFERENCE, SEED, 'spiral', { size: SIZE });

    expect(result.history.length).toBeGreaterThan(1);
    for (let i = 1; i < result.history.length; i++) {
      expect(result.history[i]!).toBeLessThanOrEqual(result.history[i - 1]!);
    }
    expect(result.loss).toBeLessThanOrEqual(result.history[0]!);
  });

  it('onStep fires with monotonically growing iter', async () => {
    const { engine } = makeFakeEngine();
    const iters: number[] = [];
    await autoFit(engine, REFERENCE, SEED, 'spiral', {
      size: SIZE,
      onStep: (step) => iters.push(step.iter),
    });

    expect(iters.length).toBeGreaterThan(1);
    for (let i = 1; i < iters.length; i++) {
      expect(iters[i]!).toBeGreaterThan(iters[i - 1]!);
    }
  });

  it('stop signal ends the run early', async () => {
    const full = makeFakeEngine();
    const fullResult = await autoFit(full.engine, REFERENCE, SEED, 'spiral', { size: SIZE });

    const partial = makeFakeEngine();
    const signal = { stop: false };
    let steps = 0;
    const earlyResult = await autoFit(partial.engine, REFERENCE, SEED, 'spiral', {
      size: SIZE,
      signal,
      onStep: () => {
        steps++;
        if (steps === 3) signal.stop = true;
      },
    });

    expect(partial.setParams.mock.calls.length).toBeLessThan(full.setParams.mock.calls.length / 2);
    // well-formed FitResult even on early exit
    expect(earlyResult.params).toBeDefined();
    expect(Number.isFinite(earlyResult.loss)).toBe(true);
    expect(Array.isArray(earlyResult.history)).toBe(true);
    expect(earlyResult.iters).toBeGreaterThanOrEqual(0);
    expect(fullResult.iters).toBeGreaterThan(earlyResult.iters);
  });

  it('fits at the reduced star budget and restores the seed count on the result', async () => {
    const { engine, setParams } = makeFakeEngine();
    const result = await autoFit(engine, REFERENCE, SEED, 'spiral', {
      size: SIZE,
      fitStars: 220000,
    });

    expect(setParams.mock.calls.length).toBeGreaterThan(0);
    for (const [p] of setParams.mock.calls) {
      expect(p.starCount).toBe(220000);
    }
    expect(result.params.starCount).toBe(SEED.starCount);
  });

  it('a null-descriptor frame is never accepted', async () => {
    // Force the 3rd grab() to come back black (dead render, computeDescriptor
    // -> null -> loss 1e9). report() only ever logs the *current best* loss,
    // so a rejected 1e9 candidate must never show up in the history.
    const { engine } = makeFakeEngine(3);
    const result = await autoFit(engine, REFERENCE, SEED, 'spiral', { size: SIZE });

    for (const loss of result.history) {
      expect(Number.isFinite(loss)).toBe(true);
      expect(loss).toBeLessThan(1e9);
    }
    expect(Number.isFinite(result.loss)).toBe(true);
    expect(result.loss).toBeLessThan(1e9);
  });
});
