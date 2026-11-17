import type { BrowserWindow } from 'electron';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dragWithCursor } from '../../../../src/main/windows/utils/dragWithCursor';

afterEach(() => vi.useRealTimers());

describe('dragWithCursor', () => {
  it('keeps the window where the cursor holds it, and stops when told', () => {
    vi.useFakeTimers();
    const setPosition = vi.fn();
    const win = { getBounds: () => ({ x: 100, y: 50 }), setPosition, isDestroyed: () => false };
    let cursor = { x: 120, y: 60 };
    const stop = dragWithCursor(win as unknown as BrowserWindow, () => cursor);
    cursor = { x: 300, y: 10 };
    vi.advanceTimersByTime(16);
    expect(setPosition).toHaveBeenLastCalledWith(280, 0);
    stop();
    cursor = { x: 0, y: 0 };
    vi.advanceTimersByTime(64);
    expect(setPosition).toHaveBeenCalledTimes(1);
  });
});
