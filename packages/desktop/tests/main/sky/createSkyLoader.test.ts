import { describe, expect, it, vi } from 'vitest';
import { createSkyLoader } from '../../../src/main/sky/createSkyLoader';

const deps = (over: Partial<Parameters<typeof createSkyLoader>[0]> = {}) => ({
  isSyncing: () => false,
  prune: vi.fn(async () => undefined),
  show: vi.fn(async () => undefined),
  logError: vi.fn(),
  ...over,
});

describe('createSkyLoader', () => {
  it('prunes, then shows the sky', async () => {
    const d = deps();
    await createSkyLoader(d)();
    expect(d.prune).toHaveBeenCalledOnce();
    expect(d.show).toHaveBeenCalledOnce();
  });

  it('does not prune while a sync runs, but still shows the sky', async () => {
    const d = deps({ isSyncing: () => true });
    await createSkyLoader(d)();
    expect(d.prune).not.toHaveBeenCalled();
    expect(d.show).toHaveBeenCalledOnce();
  });

  it('logs a failed load instead of rejecting', async () => {
    const failure = new Error('ERR_ABORTED');
    const d = deps({ show: vi.fn(async () => Promise.reject(failure)) });
    await expect(createSkyLoader(d)()).resolves.toBeUndefined();
    expect(d.logError).toHaveBeenCalledWith('sky load:', failure);
  });
});
