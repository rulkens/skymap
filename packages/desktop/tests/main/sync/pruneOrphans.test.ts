import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pruneOrphans } from '../../../src/main/sync/pruneOrphans';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mirror-prune-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function writeFileAt(rel: string, content = 'x') {
  mkdirSync(join(root, rel, '..'), { recursive: true });
  writeFileSync(join(root, rel), content);
}
function writeInventory() {
  const files = [{ key: 'data/images/keep.webp', size: 1, sha256: 'K' }];
  writeFileAt('inventory.json', JSON.stringify({ groups: [{ label: 'g', files }] }));
  writeFileAt('images/keep.webp');
}

describe('pruneOrphans', () => {
  it('deletes keys outside the local inventory', async () => {
    writeInventory();
    writeFileAt('images/old.webp');
    writeFileAt('galaxy/old.bin');
    await pruneOrphans(root);
    expect(existsSync(join(root, 'images/keep.webp'))).toBe(true);
    expect(existsSync(join(root, 'images/old.webp'))).toBe(false);
    expect(existsSync(join(root, 'galaxy/old.bin'))).toBe(false);
  });

  it('keeps synced.json, inventory.json and .part files', async () => {
    writeInventory();
    writeFileAt('synced.json', '{}');
    writeFileAt('images/next.webp.part');
    await pruneOrphans(root);
    expect(existsSync(join(root, 'synced.json'))).toBe(true);
    expect(existsSync(join(root, 'inventory.json'))).toBe(true);
    expect(existsSync(join(root, 'images/next.webp.part'))).toBe(true);
  });

  it('does nothing without inventory.json', async () => {
    writeFileAt('images/old.webp');
    await pruneOrphans(root);
    expect(existsSync(join(root, 'images/old.webp'))).toBe(true);
  });
});
