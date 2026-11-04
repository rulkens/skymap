import { describe, expect, it } from 'vitest';
import { needsRetry } from '../../src/utils/needsRetry';

describe('needsRetry', () => {
  it('a full disk always needs a retry', () => {
    expect(needsRetry({ kind: 'diskFull', neededBytes: 2e9, freeBytes: 1e9 })).toBe(true);
  });

  it('an offline or failed sync needs one only without saved data', () => {
    expect(needsRetry({ kind: 'offline', hasData: false })).toBe(true);
    expect(needsRetry({ kind: 'failed', hasData: false })).toBe(true);
    expect(needsRetry({ kind: 'offline', hasData: true })).toBe(false);
    expect(needsRetry({ kind: 'failed', hasData: true })).toBe(false);
  });

  it('idle, syncing and ready never do', () => {
    expect(needsRetry({ kind: 'idle' })).toBe(false);
    expect(needsRetry({ kind: 'syncing' })).toBe(false);
    expect(needsRetry({ kind: 'ready' })).toBe(false);
  });
});
