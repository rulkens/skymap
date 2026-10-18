import { afterEach, describe, expect, it, vi } from 'vitest';

import { recallMode } from '../../../packages/website/src/dev/overlay/recallMode';
import { switchedMode } from '../../../packages/website/src/dev/overlay/switchedMode';

describe('switchedMode', () => {
  it('flips on Tab, whichever mode is current', () => {
    expect(switchedMode('Tab', 'notes')).toBe('marks');
    expect(switchedMode('Tab', 'marks')).toBe('notes');
  });

  it('picks on N and T, in either case, and stays put when already there', () => {
    expect(switchedMode('n', 'marks')).toBe('notes');
    expect(switchedMode('T', 'notes')).toBe('marks');
    expect(switchedMode('t', 'marks')).toBe('marks');
  });

  it('ignores every other key, so C, W and G stay free for the marks', () => {
    for (const key of ['c', 'w', 'g', 'f', 'Enter', ' '])
      expect(switchedMode(key, 'notes')).toBeNull();
  });
});

describe('recallMode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is Notes when nothing is stored, and Marks only for a stored "marks"', () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    expect(recallMode()).toBe('notes');
    vi.stubGlobal('localStorage', { getItem: () => 'marks' });
    expect(recallMode()).toBe('marks');
    vi.stubGlobal('localStorage', { getItem: () => 'garbage' });
    expect(recallMode()).toBe('notes');
  });

  it('is Notes when storage throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(recallMode()).toBe('notes');
  });
});
