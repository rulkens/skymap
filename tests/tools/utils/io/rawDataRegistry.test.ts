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

import { rawDataPath, RAW_DATA } from '../../../../tools/utils/io/rawDataRegistry';

describe('rawDataPath resolves mcxc + mscc keys to absolute paths', () => {
  it('mcxc.table resolves to an absolute path ending with the registered relative path', () => {
    const p = rawDataPath('mcxc.table');
    expect(isAbsolute(p)).toBe(true);
    expect(p.endsWith(RAW_DATA['mcxc.table'].path.replace(/\//g, sep))).toBe(true);
  });
});
