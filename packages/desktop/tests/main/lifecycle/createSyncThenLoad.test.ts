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
    await expect(createSyncThenLoad(d).syncThenLoad(true)).resolves.toBeUndefined();
    expect(state.status.kind).toBe('offline');
    expect(state.hasData).toBe(false);
    expect(d.showControl).toHaveBeenCalled();
  });

  it('a sync that throws fails with the error as its detail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { state, deps: d } = deps({
      sync: vi.fn(async () => Promise.reject(new Error('EACCES'))),
    });
    await createSyncThenLoad(d).syncThenLoad(true);
    expect(state.status).toEqual({
      kind: 'failed',
      failure: { reason: 'error', key: null, detail: 'EACCES' },
    });
  });

  it('records when the attempt ended, whether or not it worked', async () => {
    const { state, deps: d } = deps();
    const before = Date.now();
    await createSyncThenLoad(d).syncThenLoad(true);
    expect(state.lastAttempt).toBeGreaterThanOrEqual(before);
  });

  // Without the carry, a resumed download's bar started again from zero against what was left.
  it('pause stops the sync, and the resumed one counts on from where it paused', async () => {
    const sync = vi.fn<SyncThenLoadDeps['sync']>(async (signal, onProgress) => {
      if (sync.mock.calls.length === 1) {
        onProgress({ doneBytes: 40, totalBytes: 100 });
        await new Promise((r) => signal.addEventListener('abort', r));
        return { kind: 'paused' };
      }
      await new Promise((r) => setTimeout(r));
      onProgress({ doneBytes: 0, totalBytes: 60 });
      onProgress({ doneBytes: 60, totalBytes: 60 });
      return { kind: 'synced' };
    });
    const { state, deps: d } = deps({ sync });
    const { syncThenLoad, pause } = createSyncThenLoad(d);
    const first = syncThenLoad(true);
    await vi.waitFor(() => expect(state.progress).toEqual({ doneBytes: 40, totalBytes: 100 }));
    pause();
    await first;
    expect(state.status.kind).toBe('paused');

    const resumed = syncThenLoad(false);
    expect(state.progress).toEqual({ doneBytes: 40, totalBytes: 100 });
    await resumed;
    expect(state.progress).toEqual({ doneBytes: 100, totalBytes: 100 });
  });

  it('runs one sync at a time', async () => {
    let finish: () => void = () => {};
    const sync = vi.fn(
      () => new Promise<{ kind: 'unchanged' }>((r) => (finish = () => r({ kind: 'unchanged' }))),
    );
    const { deps: d } = deps({ sync });
    const { syncThenLoad } = createSyncThenLoad(d);
    const first = syncThenLoad(true);
    await syncThenLoad(true);
    finish();
    await first;
    expect(sync).toHaveBeenCalledOnce();
  });
});
