import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeFileAtomically } from '../../../../src/main/files/utils/writeFileAtomically';

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'atomic-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('writeFileAtomically', () => {
  it('lands one whole write of two in flight, owner-only, with no temp left', async () => {
    const path = join(dir, 'settings.json');
    await Promise.all([
      writeFileAtomically(path, '"AAAAAAAA"'),
      writeFileAtomically(path, '"BBBBBBBB"'),
    ]);
    expect(['"AAAAAAAA"', '"BBBBBBBB"']).toContain(readFileSync(path, 'utf8'));
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual(['settings.json']);
  });
});
