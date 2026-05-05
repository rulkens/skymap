import { describe, it, expect } from 'vitest';
import { scoreFamousMatch } from '../../../src/components/CommandPalette/scoreFamousMatch';

const M31 = {
  id: 'm31',
  names: ['M31', 'NGC 224', 'Andromeda Galaxy'],
  description: 'The nearest large spiral galaxy.',
};

describe('scoreFamousMatch', () => {
  it('returns >0 for an exact-prefix name match', () => {
    expect(scoreFamousMatch(M31, 'M31')).toBeGreaterThan(0);
    expect(scoreFamousMatch(M31, 'm31')).toBeGreaterThan(0);
  });

  it('matches by common-name substring (case-insensitive)', () => {
    expect(scoreFamousMatch(M31, 'andromeda')).toBeGreaterThan(0);
  });

  it('matches description keywords', () => {
    expect(scoreFamousMatch(M31, 'spiral')).toBeGreaterThan(0);
  });

  it('returns 0 for a query that matches nothing', () => {
    expect(scoreFamousMatch(M31, 'sombrero')).toBe(0);
  });

  it('ranks exact name matches higher than description matches', () => {
    expect(scoreFamousMatch(M31, 'M31')).toBeGreaterThan(scoreFamousMatch(M31, 'spiral'));
  });
});
