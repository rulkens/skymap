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
// structural invariants — a new textured body that forgets `upstream` or the
// shared fetcher would fetch nothing and fail silently; the test catches that
// without restating the URL values.
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

  it('every gitignored raw texture-source file carries an upstream URL + the shared fetcher', () => {
    const rawSources = textureKeys.filter(
      (key) => RAW_DATA[key].source === 'gitignored' && RAW_DATA[key].kind === 'file',
    );
    expect(rawSources.length).toBeGreaterThan(0);
    for (const key of rawSources) {
      const entry: RawDataEntry = RAW_DATA[key];
      expect(entry.upstream, key).toBeTruthy();
      expect(entry.fetcher, key).toBe('tools/fetch/fetchTextures.ts');
    }
  });
});
