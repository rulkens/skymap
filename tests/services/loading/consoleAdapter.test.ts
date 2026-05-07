import { describe, expect, it, vi, beforeEach } from 'vitest';
import { consoleAdapterFor } from '../../../src/services/loading/consoleAdapter';
import type { LoadState } from '../../../src/services/loading/types';

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

  it('does not log every byte event', () => {
    const log = consoleAdapterFor('test');
    log(loading(0, 100), loading(10, 100));
    log(loading(10, 100), loading(20, 100));
    log(loading(20, 100), loading(30, 100));
    // bytes-progress logs are throttled to <= 1 in fast succession
    expect((console.log as any).mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('logs ready transition', () => {
    const log = consoleAdapterFor('test');
    log(loading(100, 100), ready);
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('ready'),
      expect.anything(),
    );
  });
});
