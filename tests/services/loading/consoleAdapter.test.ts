import { describe, expect, it, vi, beforeEach } from 'vitest';
import { consoleAdapterFor } from '../../../src/services/loading/consoleAdapter';
import type { LoadState } from '../../../src/@types/loading/LoadState';

const idle: LoadState<unknown> = { kind: 'idle' };
const loading = (loaded: number, total: number, attempt = 0): LoadState<unknown> => ({
  kind: 'loading',
  req: {},
  loaded,
  total,
  attempt,
});
const ready: LoadState<unknown> = { kind: 'ready', req: {}, value: 'x', loadedAtMs: 0 };
const errState: LoadState<unknown> = {
  kind: 'error',
  req: {},
  error: new Error('boom'),
  finalAttempt: 2,
};

describe('consoleAdapterFor', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('logs load-started transition', () => {
    const log = consoleAdapterFor('test');
    log(idle, loading(0, 100));
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[loading] test'),
      expect.anything(),
    );
  });

  it('logs error with warn level', () => {
    const log = consoleAdapterFor('test');
    log(loading(50, 100), errState);
    expect(console.warn).toHaveBeenCalled();
  });

  it('does not log byte-progress events at all', () => {
    const log = consoleAdapterFor('test');
    log(loading(0, 100), loading(10, 100));
    log(loading(10, 100), loading(20, 100));
    log(loading(20, 100), loading(30, 100));
    // Per-chunk progress drives the loading-bar UI via slot state, not the
    // console — logging it floods the console on every page load.  None of
    // these byte updates should produce a console line.
    expect((console.log as any).mock.calls.length).toBe(0);
  });

  it('logs ready transition', () => {
    const log = consoleAdapterFor('test');
    log(loading(100, 100), ready);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('ready'),
      expect.anything(),
    );
  });

  it('does not log idle→idle no-op transitions', () => {
    const log = consoleAdapterFor('test');
    log(idle, idle);
    expect(console.log).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });
});
