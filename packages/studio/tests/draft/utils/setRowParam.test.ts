import { describe, it, expect } from 'vitest';

import { setRowParam } from '../../../src/draft/utils/setRowParam';
import {
  atPoint,
  dollyTo,
  flyPath,
  hold,
  oscillate,
  seq,
} from '../../../../../src/services/engine/animation/effectHelpers';
import type { ClipData } from '../../../../../src/@types/animation/ClipData';

describe('setRowParam', () => {
  it("setRowParam sets a nested effect's param", () => {
    const data: ClipData = { timeline: [seq([dollyTo(300, 4), hold(1)])] };

    const next = setRowParam(data, { kind: 'effect', path: [0, 0] }, 'over', 6);

    expect(next.timeline[0]).toMatchObject({ children: [{ kind: 'set', to: 300, over: 6 }, {}] });
    expect(data.timeline[0]).toMatchObject({ children: [{ over: 4 }, {}] });
  });

  it('setRowParam with undefined removes an optional param', () => {
    const data: ClipData = {
      timeline: [oscillate('pitch', { amp: 0.1, period: 16, over: 10, fade: 2 })],
    };

    const next = setRowParam(data, { kind: 'effect', path: [0] }, 'fade', undefined);

    expect('fade' in next.timeline[0]!).toBe(false);
    expect(next.timeline[0]).toMatchObject({ kind: 'osc', amp: 0.1, period: 16, over: 10 });
  });

  it('setRowParam edits one waypoint', () => {
    const waypoints = [atPoint([0, 0, 0], 5), atPoint([1, 0, 0], 5), atPoint([2, 0, 0], 5)];
    const data: ClipData = { timeline: [hold(1), flyPath(waypoints, { over: 12 })] };

    const next = setRowParam(data, { kind: 'waypoint', path: [1], index: 2 }, 'linger', 0.7);

    const path = next.timeline[1]!;
    if (path.kind !== 'flyPath') throw new Error('expected the flyPath');
    expect(path.waypoints[2]).toEqual({ at: [2, 0, 0], distance: 5, linger: 0.7 });
    expect(path.waypoints[0]).toBe(waypoints[0]);
    expect(path.waypoints[1]).toBe(waypoints[1]);
    expect(waypoints[2]).toEqual({ at: [2, 0, 0], distance: 5 });
  });
});
