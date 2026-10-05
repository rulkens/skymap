import { describe, expect, it } from 'vitest';

import { inlineSegments } from '../../../src/utils/text/inlineSegments';

describe('inlineSegments', () => {
  it('returns copy without markup as a single text segment', () => {
    expect(inlineSegments('no markup here')).toEqual([{ kind: 'text', text: 'no markup here' }]);
  });

  it('tags an emphasised span and the text either side of it', () => {
    expect(inlineSegments('a slime mould, <i>Physarum polycephalum</i>, which grows')).toEqual([
      { kind: 'text', text: 'a slime mould, ' },
      { kind: 'em', text: 'Physarum polycephalum' },
      { kind: 'text', text: ', which grows' },
    ]);
  });

  it('emits no empty text segment for a span at either end', () => {
    expect(inlineSegments('<i>Physarum</i> grows')).toEqual([
      { kind: 'em', text: 'Physarum' },
      { kind: 'text', text: ' grows' },
    ]);
    expect(inlineSegments('it grows, <i>Physarum</i>')).toEqual([
      { kind: 'text', text: 'it grows, ' },
      { kind: 'em', text: 'Physarum' },
    ]);
  });

  it('carries a link’s href alongside its text', () => {
    expect(inlineSegments('a <a href="https://example.org/x">slime mould</a>, which')).toEqual([
      { kind: 'text', text: 'a ' },
      { kind: 'link', text: 'slime mould', href: 'https://example.org/x' },
      { kind: 'text', text: ', which' },
    ]);
  });

  // Greedy bodies would swallow the prose between two links into one segment.
  it('keeps two links in one sentence apart', () => {
    expect(inlineSegments('<a href="/a">one</a> and <a href="/b">two</a>')).toEqual([
      { kind: 'link', text: 'one', href: '/a' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', text: 'two', href: '/b' },
    ]);
  });

  it('mixes the two tags in one line', () => {
    expect(inlineSegments('<a href="/a">mould</a>, <i>Physarum</i>')).toEqual([
      { kind: 'link', text: 'mould', href: '/a' },
      { kind: 'text', text: ', ' },
      { kind: 'em', text: 'Physarum' },
    ]);
  });

  it('leaves other tags as literal text', () => {
    expect(inlineSegments('a <b>bold</b> claim')).toEqual([
      { kind: 'text', text: 'a <b>bold</b> claim' },
    ]);
  });

  // A module-level regex carries `lastIndex` between calls unless the parse
  // consumes it; two identical calls must agree.
  it('does not carry parser state between calls', () => {
    const copy = 'a <a href="/a">link</a> here';
    expect(inlineSegments(copy)).toEqual(inlineSegments(copy));
  });
});
