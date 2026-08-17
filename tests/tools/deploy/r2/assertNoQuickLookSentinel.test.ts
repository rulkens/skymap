import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { assertNoQuickLookSentinel } from '../../../../tools/deploy/r2/assertNoQuickLookSentinel';
import { quickLookSentinelPath } from '../../../../tools/utils/volume/quickLookSentinelPath';

describe('assertNoQuickLookSentinel', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'quicklook-sentinel-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('refuses to sync while the quick-look sentinel exists', () => {
    const sentinel = quickLookSentinelPath(dir);
    mkdirSync(dirname(sentinel), { recursive: true });
    writeFileSync(sentinel, '');
    expect(() => assertNoQuickLookSentinel(dir)).toThrowError(/npm run build-mcpm/);
  });

  it('permits a sync when no sentinel is present', () => {
    expect(() => assertNoQuickLookSentinel(dir)).not.toThrow();
  });
});
