import { describe, expect, it } from 'vitest';
import { checkCandidates } from '../../../../tools/utils/refactor/checkCandidates';

const TEXTS = new Map([
  ['/r/changed.ts', 'export const a = 1;'],
  ['/r/untouched.ts', 'export const b = x.yaw;'],
  ['/r/other.ts', 'export const c = 3;'],
  ['/r/rate.ts', 'export const d = yawRate;'],
  ['/r/style.css', '.yaw {}'],
]);

function candidates(changed: string[], names = ['yaw']) {
  return [...checkCandidates({ texts: TEXTS, changed, names })].sort();
}

describe('checkCandidates', () => {
  it('includes an untouched file that mentions the old name', () => {
    expect(candidates([])).toContain('/r/untouched.ts');
  });

  it('includes every changed file', () => {
    expect(candidates(['/r/changed.ts', '/r/other.ts'])).toEqual([
      '/r/changed.ts',
      '/r/other.ts',
      '/r/untouched.ts',
    ]);
  });

  it('skips a file that mentions neither and was not changed', () => {
    expect(candidates(['/r/changed.ts'])).not.toContain('/r/other.ts');
  });

  it('matches whole words only', () => {
    expect(candidates([])).not.toContain('/r/rate.ts');
  });

  it('matches the new name too, and skips a changed file that no longer exists', () => {
    expect(candidates(['/gone.ts'], ['yaw', 'yawRate'])).toEqual(['/r/rate.ts', '/r/untouched.ts']);
  });
});
