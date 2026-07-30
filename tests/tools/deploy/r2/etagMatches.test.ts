/**
 * Skipping an unchanged upload is exactly "does the local file's MD5 equal the
 * remote ETag?", so this predicate is the testable seam — the HEAD fetch and
 * the hashing around it are thin I/O wrappers.
 */
import { describe, expect, it } from 'vitest';
import { etagMatches } from '../../../../tools/deploy/r2/etagMatches';

describe('etagMatches', () => {
  const md5 = 'd41d8cd98f00b204e9800998ecf8427e';

  it('matches a bare hex ETag', () => {
    expect(etagMatches(md5, md5)).toBe(true);
  });

  it('matches a quoted ETag (R2/HTTP wrap ETags in double quotes)', () => {
    expect(etagMatches(md5, `"${md5}"`)).toBe(true);
  });

  it('matches a weak-validator ETag (strips the W/ prefix)', () => {
    expect(etagMatches(md5, `W/"${md5}"`)).toBe(true);
  });

  it('is case-insensitive on the hex digest', () => {
    expect(etagMatches(md5.toUpperCase(), `"${md5}"`)).toBe(true);
  });

  it('does not match a different digest', () => {
    expect(etagMatches(md5, '"ffffffffffffffffffffffffffffffff"')).toBe(false);
  });

  it('never matches a multipart composite ETag (contains a part count)', () => {
    // Multipart produces md5-of-part-md5s + "-N", not the whole-object MD5 —
    // uncomparable, so force a re-upload rather than risk a wrong skip.
    expect(etagMatches(md5, '"abc123-3"')).toBe(false);
  });

  it('does not match when the object is absent (null remote ETag)', () => {
    expect(etagMatches(md5, null)).toBe(false);
  });

  it('does not match an empty remote ETag', () => {
    expect(etagMatches(md5, '')).toBe(false);
  });
});
