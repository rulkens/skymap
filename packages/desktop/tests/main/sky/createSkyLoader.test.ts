import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSkyLoader } from '../../../src/main/sky/createSkyLoader';
import { SKY_RETRY_MS } from '../../../src/main/sky/data/skyRetryMs';

const deps = (over: Partial<Parameters<typeof createSkyLoader>[0]> = {}) => ({
  prune: vi.fn(async () => undefined),
  show: vi.fn(async () => undefined),
  logError: vi.fn(),
  ...over,
});

afterEach(() => vi.useRealTimers());

describe('createSkyLoader', () => {
  it('logs a failed load instead of rejecting', async () => {
    vi.useFakeTimers();
    const failure = new Error('ERR_ABORTED');
    const d = deps({ show: vi.fn(async () => Promise.reject(failure)) });
    const load = createSkyLoader(d)();
    await vi.advanceTimersByTimeAsync(SKY_RETRY_MS);
    await expect(load).resolves.toBeUndefined();
    expect(d.logError).toHaveBeenCalledWith('sky load:', failure);
  });

  // Regression: a failed first load left an unattended kiosk black, with nothing crashed for
  // supervision to reload.
  it('tries a failed load once more after a pause', async () => {
    vi.useFakeTimers();
    const show = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('ERR_ABORTED'));
    const load = createSkyLoader(deps({ show }))();
    await vi.advanceTimersByTimeAsync(SKY_RETRY_MS - 1);
    expect(show).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    await load;
    expect(show).toHaveBeenCalledTimes(2);
  });
});
