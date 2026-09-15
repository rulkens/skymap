import { describe, it, expect } from 'vitest';
import { foldCaptureFaceRows } from '../../../src/utils/perf/foldCaptureFaceRows';

type Reading = { avgMs: number; spark: number[]; staleFrames: number };

describe('foldCaptureFaceRows', () => {
  it('folds six faces into one row, summing avgs and newest-aligned sparklines', () => {
    const faces = [0, 1, 2, 3, 4, 5].map((f) => `sky-cubemap-blit·probe·FACE[${f}]`);
    const readings = new Map<string, Reading>();
    readings.set('stars', { avgMs: 0.5, spark: [0.4, 0.6], staleFrames: 0 });
    for (const face of faces) readings.set(face, { avgMs: 1, spark: [1, 1], staleFrames: 3 });
    // Face 0 started a frame later: its one sample lines up with the newest.
    readings.set(faces[0]!, { avgMs: 1, spark: [2], staleFrames: 3 });

    const rows = foldCaptureFaceRows(['stars', ...faces], (n) => readings.get(n)!);

    expect(rows).toEqual([
      { name: 'stars', avgMs: 0.5, spark: [0.4, 0.6], idle: false },
      { name: 'sky-cubemap-blit·probe', avgMs: 6, spark: [5, 7], idle: true },
    ]);
  });

  it('is live while any one face sampled this frame', () => {
    const names = ['g·probe·FACE[0]', 'g·probe·FACE[1]'];
    const [row] = foldCaptureFaceRows(names, (n) => ({
      avgMs: 1,
      spark: [1],
      staleFrames: n.endsWith('[1]') ? 0 : 2,
    }));
    expect(row!.idle).toBe(false);
  });
});
