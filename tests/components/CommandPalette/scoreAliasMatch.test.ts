import { describe, it, expect } from 'vitest';
import { scoreAliasMatch } from '../../../src/components/CommandPalette/scoreAliasMatch';

const NGC4565 = {
  names: ['NGC 4565', 'UGC 7772', 'MCG +04-30-006'],
};

describe('scoreAliasMatch', () => {
  it('returns >0 for an exact name match', () => {
    expect(scoreAliasMatch(NGC4565, 'NGC 4565')).toBeGreaterThan(0);
    expect(scoreAliasMatch(NGC4565, 'ngc 4565')).toBeGreaterThan(0);
  });

  it('matches the spaceless form (ngc4565)', () => {
    expect(scoreAliasMatch(NGC4565, 'ngc4565')).toBeGreaterThan(0);
  });

  it('matches a prefix substring', () => {
    expect(scoreAliasMatch(NGC4565, 'NGC 4')).toBeGreaterThan(0);
  });

  it('matches a non-prefix substring (UGC inside the alias list)', () => {
    expect(scoreAliasMatch(NGC4565, 'UGC')).toBeGreaterThan(0);
  });

  it('returns 0 for a query that matches nothing', () => {
    expect(scoreAliasMatch(NGC4565, 'sombrero')).toBe(0);
  });

  it('ranks exact matches higher than substring matches', () => {
    expect(scoreAliasMatch(NGC4565, 'NGC 4565')).toBeGreaterThan(
      scoreAliasMatch(NGC4565, 'UGC'),
    );
  });

  it('case-insensitive across both forms', () => {
    const a = scoreAliasMatch(NGC4565, 'ugc 7772');
    const b = scoreAliasMatch(NGC4565, 'UGC 7772');
    expect(a).toBe(b);
  });
});
