import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { linkPublicEntries } from '../../../tools/phone/linkPublicEntries';

const PUBLIC = resolve('public');

describe('linkPublicEntries', () => {
  let outDir = '';
  afterEach(() => rmSync(outDir, { recursive: true, force: true }));

  it('makes every real public/ entry reachable from the build, leaving build output alone', () => {
    outDir = mkdtempSync(join(tmpdir(), 'phone-dist-'));
    writeFileSync(join(outDir, 'robots.txt'), 'from the build');
    linkPublicEntries(PUBLIC, outDir);
    for (const name of readdirSync(PUBLIC)) {
      if (name === 'robots.txt') continue;
      expect(statSync(join(outDir, name)).isDirectory()).toBe(
        statSync(join(PUBLIC, name)).isDirectory(),
      );
    }
    expect(readFileSync(join(outDir, 'robots.txt'), 'utf8')).toBe('from the build');
  });
});
