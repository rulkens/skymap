import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasCompleteLocalSet } from '../../../src/main/sync/hasCompleteLocalSet';

const inventory = {
  groups: [{ label: 'g', files: [{ key: 'data/images/a.webp', size: 1, sha256: 'A' }] }],
};
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mirror-complete-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeFileAt(rel: string, content: string) {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), content);
}

describe('hasCompleteLocalSet', () => {
  it('false without inventory.json', async () => {
    expect(await hasCompleteLocalSet(root)).toBe(false);
  });

  it('false when a listed key is missing on disk', async () => {
    writeFileAt('inventory.json', JSON.stringify(inventory));
    writeFileAt('synced.json', JSON.stringify({ 'data/images/a.webp': 'A' }));
    expect(await hasCompleteLocalSet(root)).toBe(false);
  });

  it('true when every listed key is synced and present', async () => {
    writeFileAt('inventory.json', JSON.stringify(inventory));
    writeFileAt('synced.json', JSON.stringify({ 'data/images/a.webp': 'A' }));
    writeFileAt('images/a.webp', 'x');
    expect(await hasCompleteLocalSet(root)).toBe(true);
  });
});
