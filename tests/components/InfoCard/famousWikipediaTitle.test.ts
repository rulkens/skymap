import { describe, expect, it } from 'vitest';
import { famousWikipediaTitle } from '../../../src/components/InfoCard/famousWikipediaTitle';

describe('famousWikipediaTitle', () => {
  it('prefers the NGC/IC designation over a Messier short id', () => {
    // Messier entries lead with the short id (which resolves to a Wikipedia
    // disambiguation page); the NGC slug is the real article.
    expect(famousWikipediaTitle(['M51', 'NGC 5194'])).toBe('NGC 5194');
  });

  it('keeps the NGC name when it is first and the aliases would 404', () => {
    // NGC-primary galaxies carry UGC/PGC/KPG aliases that have no Wikipedia
    // article — picking names[1] blindly would link to a 404.
    expect(
      famousWikipediaTitle(['NGC 3166', 'UGC 5516', 'PGC 29814', 'KPG 228A']),
    ).toBe('NGC 3166');
  });

  it('handles an IC designation anywhere in the list', () => {
    expect(famousWikipediaTitle(['Foo', 'IC 1613'])).toBe('IC 1613');
  });

  it('falls back to names[1] then names[0] when no NGC/IC name is present', () => {
    expect(famousWikipediaTitle(['Alpha', 'Beta'])).toBe('Beta');
    expect(famousWikipediaTitle(['Solo'])).toBe('Solo');
  });
});
