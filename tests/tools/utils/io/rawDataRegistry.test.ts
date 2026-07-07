/**
 * rawDataRegistry — tests for the cluster/supercluster + DESI registry
 * entries.
 *
 * The registry is a static lookup table; these tests guard against typos in
 * the new mcxc.*, mscc.*, and desi.* keys and assert that rawDataPath()
 * returns absolute paths ending with the registered relative paths.
 */
import { describe, it, expect } from 'vitest';
import { isAbsolute, sep } from 'node:path';

import { rawDataPath, RAW_DATA, type RawDataKey } from '../../../../tools/utils/io/rawDataRegistry';

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

describe('rawDataPath resolves desi keys to absolute paths', () => {
  it('desi.qso resolves to an absolute path ending with the registered relative path', () => {
    const p = rawDataPath('desi.qso');
    expect(isAbsolute(p)).toBe(true);
    expect(p.endsWith(RAW_DATA['desi.qso'].path.replace(/\//g, sep))).toBe(true);
  });

  const desiFitsKeys: RawDataKey[] = ['desi.bgs', 'desi.lrg', 'desi.elg', 'desi.qso'];

  it.each(desiFitsKeys)(
    'the four desi .fits entries are gitignored (fetcher-produced): %s',
    (key) => {
      expect(RAW_DATA[key].source).toBe('gitignored');
    },
  );

  it('desi.readme is committed', () => {
    expect(RAW_DATA['desi.readme'].source).toBe('committed');
  });

  it('desi.sha256 is committed', () => {
    expect(RAW_DATA['desi.sha256'].source).toBe('committed');
  });
});
