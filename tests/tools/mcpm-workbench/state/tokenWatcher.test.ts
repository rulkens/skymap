/**
 * createTokenWatcher — the mechanics behind Viewport.tsx's reset/clearTrace/export/scfd
 * subscriber watchers: change detection, no-change no-fire, and the two first-call regimes
 * (seeded vs. never-seen) the call sites there rely on.
 */
import { describe, expect, it } from 'vitest';
import { createTokenWatcher } from '../../../../tools/mcpm-workbench/src/state/tokenWatcher';

describe('createTokenWatcher', () => {
  it('reports a change when the value differs from the last-seen one', () => {
    const watcher = createTokenWatcher(0);
    expect(watcher.changed(1)).toBe(true);
  });

  it('does not fire again while the value stays the same', () => {
    const watcher = createTokenWatcher(0);
    expect(watcher.changed(1)).toBe(true);
    expect(watcher.changed(1)).toBe(false);
    expect(watcher.changed(1)).toBe(false);
  });

  it('fires on every distinct value in a hand-computed sequence', () => {
    const watcher = createTokenWatcher(0);
    const seen = [1, 1, 2, 2, 2, 3].map((token) => watcher.changed(token));
    expect(seen).toEqual([true, false, true, false, false, true]);
  });

  // Viewport.tsx's four subscriber watchers are constructed already holding the store's
  // current token (line 212's `createTokenWatcher(store.getSnapshot().sim.resetToken)`),
  // so mounting itself must not read as a change.
  it('does not fire on the first call when constructed with the current value', () => {
    const watcher = createTokenWatcher(5);
    expect(watcher.changed(5)).toBe(false);
  });

  // No initial value means "never seen" — matches the file's other last-seen-value
  // sentinels (e.g. `lastVolpathKey = null`), where the first real reading always differs.
  it('fires on the first call when constructed with no value', () => {
    const watcher = createTokenWatcher<number>();
    expect(watcher.changed(0)).toBe(true);
  });

  it('sync re-arms the remembered value without reporting a change', () => {
    const watcher = createTokenWatcher(0);
    watcher.sync(7);
    expect(watcher.changed(7)).toBe(false);
    expect(watcher.changed(8)).toBe(true);
  });
});
