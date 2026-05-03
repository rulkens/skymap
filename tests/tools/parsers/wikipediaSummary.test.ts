import { describe, it, expect } from 'vitest';
import {
  parseWikipediaSummary,
  wikipediaSummaryUrl,
} from '../../../tools/parsers/wikipediaSummary';

describe('parseWikipediaSummary', () => {
  it('extracts the summary from a standard article response', () => {
    const json = JSON.stringify({
      type: 'standard',
      title: 'Andromeda Galaxy',
      extract: 'The Andromeda Galaxy is a barred spiral galaxy.',
    });
    const out = parseWikipediaSummary(json);
    expect(out.title).toBe('Andromeda Galaxy');
    expect(out.extract).toBe('The Andromeda Galaxy is a barred spiral galaxy.');
  });

  it('returns empty extract for disambiguation pages (type field)', () => {
    const json = JSON.stringify({
      type: 'disambiguation',
      title: 'Andromeda',
      extract: 'Andromeda may refer to: A constellation; A galaxy; A character.',
    });
    const out = parseWikipediaSummary(json);
    expect(out.extract).toBe('');
    // Title still survives so the caller can log what page it landed on.
    expect(out.title).toBe('Andromeda');
  });

  it('returns empty extract for "may refer to" prose (defensive fallback)', () => {
    // Even when type isn't set to "disambiguation", catch the prose pattern.
    const json = JSON.stringify({
      title: 'NGC 224',
      extract: 'May refer to several distinct objects in the catalog.',
    });
    const out = parseWikipediaSummary(json);
    expect(out.extract).toBe('');
  });

  it('treats missing extract as empty string', () => {
    const json = JSON.stringify({ type: 'standard', title: 'Foo' });
    const out = parseWikipediaSummary(json);
    expect(out.extract).toBe('');
    expect(out.title).toBe('Foo');
  });

  it('treats missing title as empty string', () => {
    const json = JSON.stringify({ type: 'standard', extract: 'A galaxy.' });
    const out = parseWikipediaSummary(json);
    expect(out.extract).toBe('A galaxy.');
    expect(out.title).toBe('');
  });

  it('throws SyntaxError on malformed JSON', () => {
    expect(() => parseWikipediaSummary('not json')).toThrow();
  });
});

describe('wikipediaSummaryUrl', () => {
  it('encodes a normal title', () => {
    const url = wikipediaSummaryUrl('Messier_31');
    expect(url).toContain('/page/summary/Messier_31');
  });

  it('converts spaces to underscores before URL-encoding', () => {
    // "Andromeda Galaxy" → "Andromeda_Galaxy" → URL-encoded.
    const url = wikipediaSummaryUrl('Andromeda Galaxy');
    expect(url).toContain('/page/summary/Andromeda_Galaxy');
  });

  it('rejects empty titles loudly', () => {
    expect(() => wikipediaSummaryUrl('')).toThrow();
    expect(() => wikipediaSummaryUrl('   ')).toThrow();
  });
});
