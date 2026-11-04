import { describe, expect, it, vi } from 'vitest';
import { createSkyLoader } from '../../../src/main/sky/createSkyLoader';

const deps = (over: Partial<Parameters<typeof createSkyLoader>[0]> = {}) => ({
  prune: vi.fn(async () => undefined),
  show: vi.fn(async () => undefined),
  logError: vi.fn(),
  ...over,
});

describe('createSkyLoader', () => {
  it('logs a failed load instead of rejecting', async () => {
    const failure = new Error('ERR_ABORTED');
    const d = deps({ show: vi.fn(async () => Promise.reject(failure)) });
    await expect(createSkyLoader(d)()).resolves.toBeUndefined();
    expect(d.logError).toHaveBeenCalledWith('sky load:', failure);
  });
});
