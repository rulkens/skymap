/**
 * The pieces of DesktopSpread and LinkSpread lean by these two numbers. A wrong scale throws them off their stage,
 * and a leave that does not zero them leaves them hanging askew once the pointer has gone.
 */
import type { PointerEvent } from 'react';
import { describe, expect, it } from 'vitest';

import { pointerLean } from '../../../packages/website/src/utils/pointerLean';

function lean(type: string, clientX: number, clientY: number) {
  const set: Record<string, string> = {};
  const stage = {
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 400, height: 200 }),
    style: { setProperty: (name: string, value: string) => (set[name] = value) },
  };
  pointerLean({
    type,
    clientX,
    clientY,
    currentTarget: stage,
  } as unknown as PointerEvent<HTMLElement>);
  return [Number(set['--lean-x']), Number(set['--lean-y'])];
}

describe('pointerLean', () => {
  it('runs from -1 at the top left through 0 in the middle to 1 at the bottom right', () => {
    expect(lean('pointermove', 100, 50)).toEqual([-1, -1]);
    expect(lean('pointermove', 300, 150)).toEqual([0, 0]);
    expect(lean('pointermove', 500, 250)).toEqual([1, 1]);
  });

  it('comes back to rest when the pointer leaves, wherever it left from', () => {
    expect(lean('pointerleave', 500, 50)).toEqual([0, 0]);
  });
});
