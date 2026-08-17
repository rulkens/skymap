/**
 * rawDataRegistry — tests for the cluster/supercluster + DESI registry
 * entries.
 *
 * The registry is a static lookup table; this test guards against typos in
 * the registered keys and asserts that rawDataPath() returns an absolute path
 * ending with the registered relative path.
 */
import { describe, it, expect } from 'vitest';
import { isAbsolute, sep } from 'node:path';

import {
  rawDataPath,
  RAW_DATA,
  type RawDataKey,
  type RawDataEntry,
} from '../../../../tools/utils/io/rawDataRegistry';

describe('rawDataPath resolves mcxc + mscc keys to absolute paths', () => {
  it('mcxc.table resolves to an absolute path ending with the registered relative path', () => {
    const p = rawDataPath('mcxc.table');
    expect(isAbsolute(p)).toBe(true);
    expect(p.endsWith(RAW_DATA['mcxc.table'].path.replace(/\//g, sep))).toBe(true);
  });
});

// The texture pipeline reads every raw source through `rawDataPath('textures.*')`
// and the fetcher drives each download from the row's `upstream` URL. These are
// structural invariants — a source with no `upstream` cannot be re-obtained by
// anyone, and a body source the shared fetcher does not name would download
// nothing and fail silently; the test catches both without restating URL values.
describe('textures.* rows', () => {
  const textureKeys = (Object.keys(RAW_DATA) as RawDataKey[]).filter((key) =>
    key.startsWith('textures.'),
  );

  it('every textures.* key resolves to an absolute path', () => {
    expect(textureKeys.length).toBeGreaterThan(0);
    for (const key of textureKeys) {
      expect(isAbsolute(rawDataPath(key)), key).toBe(true);
    }
  });

  it('every gitignored raw texture-source file carries an upstream URL', () => {
    const rawSources = textureKeys.filter(
      (key) => RAW_DATA[key].source === 'gitignored' && RAW_DATA[key].kind === 'file',
    );
    expect(rawSources.length).toBeGreaterThan(0);
    for (const key of rawSources) {
      // Widened first: `RAW_DATA` is `as const`, so indexing by the union key
      // yields a union of literal row types where `upstream` is absent from the
      // members that lack it, rather than an optional property.
      const entry: RawDataEntry = RAW_DATA[key];
      expect(entry.upstream, key).toBeTruthy();
    }
  });

  it('every gitignored raw texture-source file is driven by the shared fetcher', () => {
    // Prefix-keyed over the whole `textures.` family rather than derived from
    // TEXTURE_SOURCES: the BMNG quadrants are not a `(body, kind)` source and
    // would slip through that view, and "a raw the pipeline reads that no command
    // can obtain" is exactly the state this assertion exists to forbid — it was
    // the quadrants' state until they joined the pull. That `fetch-textures`
    // really does download each one is checked in fetchTextures.test.ts.
    const rawSources = textureKeys.filter(
      (key) => RAW_DATA[key].source === 'gitignored' && RAW_DATA[key].kind === 'file',
    );
    expect(rawSources.length).toBeGreaterThan(0);
    for (const key of rawSources) {
      const entry: RawDataEntry = RAW_DATA[key];
      expect(entry.fetcher, key).toBe('tools/fetch/fetchTextures.ts');
    }
  });
});
