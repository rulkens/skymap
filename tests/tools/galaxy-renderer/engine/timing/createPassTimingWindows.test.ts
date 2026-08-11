/**
 * createPassTimingWindows — pins the two behaviours the module exists for:
 * a stale slot disappears rather than freezing, and row order follows the
 * declared slot list rather than insertion order. The rolling mean itself
 * is arithmetic, not worth a test.
 */
import { describe, expect, it } from 'vitest';
import { createPassTimingWindows } from '../../../../../tools/galaxy-renderer/src/engine/timing/createPassTimingWindows';

const frame = (frameIndex: number, perPassMs: ReadonlyMap<string, number>) => ({
  frameIndex,
  perPassMs,
});

describe('createPassTimingWindows', () => {
  it('drops a slot once it goes unreported past staleFrames', () => {
    const windows = createPassTimingWindows(['stars', 'bloom'], 60, 3);

    windows.record(
      frame(
        0,
        new Map([
          ['stars', 1],
          ['bloom', 2],
        ]),
      ),
    );
    expect(windows.timings().map((t) => t.slot)).toEqual(['stars', 'bloom']);

    // 'bloom' stops reporting; frameIndex creeps forward on 'stars' alone.
    windows.record(frame(1, new Map([['stars', 1]])));
    windows.record(frame(2, new Map([['stars', 1]])));
    windows.record(frame(3, new Map([['stars', 1]])));
    expect(windows.timings().map((t) => t.slot)).toEqual(['stars', 'bloom']);

    // One more unreported frame crosses staleFrames (3) since bloom's last tick (0).
    windows.record(frame(4, new Map([['stars', 1]])));
    expect(windows.timings().map((t) => t.slot)).toEqual(['stars']);
  });

  it('orders rows by the declared slot list, not by first-seen order', () => {
    const windows = createPassTimingWindows(['stars', 'scene', 'grade'], 60, 30);

    // 'grade' (the tool-only trailer) only starts reporting on a later frame,
    // after 'scene' — insertion order alone would put it last permanently.
    windows.record(
      frame(
        0,
        new Map([
          ['scene', 5],
          ['stars', 1],
        ]),
      ),
    );
    windows.record(
      frame(
        1,
        new Map([
          ['scene', 5],
          ['stars', 1],
          ['grade', 9],
        ]),
      ),
    );

    expect(windows.timings().map((t) => t.slot)).toEqual(['stars', 'scene', 'grade']);
  });
});
