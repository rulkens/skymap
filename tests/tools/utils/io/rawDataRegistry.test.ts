/**
 * rawDataRegistry — tests for the cluster/supercluster registry entries.
 *
 * The registry is a static lookup table; these tests guard against typos in
 * the new mcxc.* and mscc.* keys and assert that rawDataPath() returns
 * absolute paths ending with the registered relative paths.
 */
import { describe, it, expect } from 'vitest';
import { isAbsolute, sep } from 'node:path';

import { rawDataPath, RAW_DATA } from '../../../../tools/utils/io/rawDataRegistry';

describe('rawDataPath resolves mcxc + mscc keys to absolute paths', () => {
  it('mcxc.table resolves to an absolute path ending with the registered relative path', () => {
    const p = rawDataPath('mcxc.table');
    expect(isAbsolute(p)).toBe(true);
    expect(p.endsWith(RAW_DATA['mcxc.table'].path.replace(/\//g, sep))).toBe(true);
  });

  it('mcxc.table is gitignored (fetcher-produced)', () => {
    expect(RAW_DATA['mcxc.table'].source).toBe('gitignored');
  });

  it('mscc.table resolves to an absolute path ending with the registered relative path', () => {
    const p = rawDataPath('mscc.table');
    expect(isAbsolute(p)).toBe(true);
    expect(p.endsWith(RAW_DATA['mscc.table'].path.replace(/\//g, sep))).toBe(true);
  });

  it('mscc.table is gitignored (fetcher-produced)', () => {
    expect(RAW_DATA['mscc.table'].source).toBe('gitignored');
  });

  it('mcxc.readme is gitignored (fetcher-produced)', () => {
    expect(RAW_DATA['mcxc.readme'].source).toBe('gitignored');
  });

  it('mscc.readme is gitignored (fetcher-produced)', () => {
    expect(RAW_DATA['mscc.readme'].source).toBe('gitignored');
  });

  it('mcxc.sha256 is committed', () => {
    expect(RAW_DATA['mcxc.sha256'].source).toBe('committed');
  });

  it('mscc.sha256 is committed', () => {
    expect(RAW_DATA['mscc.sha256'].source).toBe('committed');
  });
});
