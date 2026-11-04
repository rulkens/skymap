import { describe, expect, it, vi } from 'vitest';
import type { ControlState } from '../../../src/@types/ControlState';
import type { SyncThenLoadDeps } from '../../../src/main/lifecycle/@types/SyncThenLoadDeps';
import { createSyncThenLoad } from '../../../src/main/lifecycle/createSyncThenLoad';

function deps(over: Partial<SyncThenLoadDeps> = {}) {
  const state = { status: { kind: 'idle' }, skyRunning: false } as ControlState;
  const update = vi.fn<(patch: Partial<ControlState>) => void>((patch) =>
    Object.assign(state, patch),
  );
  return {
    state,
    deps: {
      sync: vi.fn(async () => ({ kind: 'offline' as const })),
      hasCompleteSet: vi.fn(async () => true),
      state: () => state,
      update,
      readAbout: vi.fn(async () => ({ version: '1', dataDate: null })),
      showControl: vi.fn(),
      loadSky: vi.fn(async () => {}),
      ...over,
    },
  };
}

describe('createSyncThenLoad', () => {
  // Regression: a data check that threw after the download (EPERM on a folder antivirus holds) left
  // the page on "syncing" for good and rejected into main.ts, which ended a running kiosk.
  it('ends the syncing status when the data check throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { state, deps: d } = deps({
      hasCompleteSet: vi.fn(async () => Promise.reject(new Error('EPERM'))),
    });
    await expect(createSyncThenLoad(d)(true)).resolves.toBeUndefined();
    expect(state.status.kind).toBe('offline');
    expect(state.hasData).toBe(false);
    expect(d.showControl).toHaveBeenCalled();
  });

  it('runs one sync at a time', async () => {
    let finish: () => void = () => {};
    const sync = vi.fn(
      () => new Promise<{ kind: 'unchanged' }>((r) => (finish = () => r({ kind: 'unchanged' }))),
    );
    const { deps: d } = deps({ sync });
    const syncThenLoad = createSyncThenLoad(d);
    const first = syncThenLoad(true);
    await syncThenLoad(true);
    finish();
    await first;
    expect(sync).toHaveBeenCalledOnce();
  });
});
