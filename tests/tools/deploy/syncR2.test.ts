/**
 * Contract tests for the syncR2 ALLOW filter.
 *
 * `ALLOW` is the predicate `main()` applies to `readdirSync('public/data')`
 * to decide which files get uploaded to R2.  The runtime fetch surface is
 * the spec: every name the browser's cloudLoader requests must pass, and
 * the legacy un-tiered build artefacts must stay excluded.  The upload
 * loop itself shells out to wrangler, so this predicate is the testable
 * seam — given a correct ALLOW set the sweep is mechanical.
 *
 * Importing the module only pulls in the exported `ALLOW`; the top-level
 * `main().catch(...)` is guarded behind an `import.meta.url` CLI check, so
 * importing here does not fire the network/filesystem sync.
 */
import { describe, expect, it } from 'vitest';
import { ALLOW, etagMatches } from '../../../tools/deploy/syncR2';

describe('syncR2 ALLOW', () => {
  it('accepts structures.ccat and structures_meta.json', () => {
    expect(ALLOW('structures.ccat')).toBe(true);
    expect(ALLOW('structures_meta.json')).toBe(true);
  });

  it('still rejects glade.bin / sdss.bin', () => {
    // The un-tiered legacy bins are offline DisPerSE inputs, never fetched
    // from the browser — they must stay out of the R2 sync.
    expect(ALLOW('glade.bin')).toBe(false);
    expect(ALLOW('sdss.bin')).toBe(false);
  });

  it('accepts the tier-agnostic flowfield.scfd', () => {
    expect(ALLOW('flowfield.scfd')).toBe(true);
  });

  it('rejects a tier-suffixed flowfield variant', () => {
    // Flow is a single tier-agnostic cube (like filaments.bin) — there is no
    // flowfield-large.scfd, so a tier suffix must not slip through the filter.
    expect(ALLOW('flowfield-large.scfd')).toBe(false);
    expect(ALLOW('flowfield.bin')).toBe(false);
  });

  it('accepts desi-deep.bin', () => {
    // The DESI deep-cone catalog is a single tier-agnostic bin (a fixed
    // 2.5° CrB patch, like 2mrs.bin) — the browser fetches it unsuffixed.
    expect(ALLOW('desi-deep.bin')).toBe(true);
  });

  it('rejects a tier-suffixed desi-deep variant', () => {
    // There is no per-tier DESI variant — the cone is a fixed patch, not a
    // tiered downsample — so a tier suffix must not slip through the filter.
    expect(ALLOW('desi-deep-large.bin')).toBe(false);
  });
});

describe('syncR2 etagMatches', () => {
  // R2 stores a single-PUT object's ETag as the hex MD5 of its content.
  // The decision to skip an unchanged upload is exactly "does the local
  // file's MD5 equal the remote ETag?", so this predicate is the testable
  // seam — the HEAD fetch and the MD5 streaming are thin I/O wrappers.
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
    // Multipart uploads produce `md5-of-part-md5s + "-N"`, not a plain MD5
    // of the whole object — uncomparable, so force a re-upload to be safe.
    expect(etagMatches(md5, '"abc123-3"')).toBe(false);
  });

  it('does not match when the object is absent (null remote ETag)', () => {
    expect(etagMatches(md5, null)).toBe(false);
  });

  it('does not match an empty remote ETag', () => {
    expect(etagMatches(md5, '')).toBe(false);
  });
});
