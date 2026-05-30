import { describe, it, expect } from 'vitest';
import { slot, nonCommentLines } from '../../../tools/parsers/common';

describe('slot', () => {
  // A synthetic fixed-width line where each "column" is easy to verify.
  // Positions (1-based):  1234567890123456789012345
  const LINE = 'ABCDE  42.5  hello world!!';

  it('extracts a field at the start of a line (bytes 1–5)', () => {
    // ReadMe would say "bytes 1–5", and `slot` writes exactly that.
    expect(slot(LINE, 1, 5)).toBe('ABCDE');
  });

  it('extracts a numeric field and trims leading spaces (bytes 7–12)', () => {
    // The value '  42.5' lives at bytes 7–12; trimming yields '42.5'.
    expect(slot(LINE, 7, 12)).toBe('42.5');
  });

  it('extracts a multi-word string field in the middle (bytes 14–24)', () => {
    expect(slot(LINE, 14, 24)).toBe('hello world');
  });

  it('returns empty string when the slice is entirely spaces', () => {
    // bytes 6–6 is a single space character
    expect(slot(LINE, 6, 6)).toBe('');
  });

  it('returns empty string when start is past the line end', () => {
    // LINE is 25 chars; bytes 30–35 lie entirely past the end.
    expect(slot(LINE, 30, 35)).toBe('');
  });

  it('matches the hand-computed 0-based slice for a mid-line field', () => {
    // Sanity check: slot(line, s, e) === line.slice(s-1, e).trim()
    const s = 14;
    const e = 24;
    expect(slot(LINE, s, e)).toBe(LINE.slice(s - 1, e).trim());
  });
});

describe('nonCommentLines', () => {
  it('strips blank and whitespace-only lines', () => {
    const result = nonCommentLines('foo\n\n  \nbar\n');
    expect(result).toEqual(['foo', 'bar']);
  });

  it('strips lines starting with #', () => {
    expect(nonCommentLines('# comment\ndata')).toEqual(['data']);
  });

  it('strips lines starting with --', () => {
    expect(nonCommentLines('-- sql comment\ndata')).toEqual(['data']);
  });

  it('normalises CRLF line endings', () => {
    expect(nonCommentLines('a\r\nb\r\nc')).toEqual(['a', 'b', 'c']);
  });
});
