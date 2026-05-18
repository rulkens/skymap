/**
 * Integration test for the curated-override short-circuit.
 *
 * Drives the pure copy helper that fetchFamousImages will gain in this
 * task.  The helper takes an entry id + the override index + a repo
 * root, and (when the id has an override) copies
 * public/images/famous-curated/<id>/atlas.webp to
 * public/images/famous/<id>.webp.
 *
 * The CLI loop integration is exercised by the manual smoke step
 * below; this test pins the unit-level contract.
 */
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { copyCuratedAtlas } from '../../../tools/famous/fetchFamousImages';

function fixtureRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'famous-curated-test-'));
  mkdirSync(resolve(root, 'public/images/famous'), { recursive: true });
  mkdirSync(resolve(root, 'public/images/famous-curated/m31'), { recursive: true });
  writeFileSync(resolve(root, 'public/images/famous-curated/m31/atlas.webp'), Buffer.from([1, 2, 3, 4]));
  return root;
}

describe('copyCuratedAtlas', () => {
  it('copies atlas.webp from famous-curated/<id>/ to famous/<id>.webp', () => {
    const repo = fixtureRepo();
    copyCuratedAtlas(repo, 'm31');
    const dest = resolve(repo, 'public/images/famous/m31.webp');
    expect(existsSync(dest)).toBe(true);
    expect(Array.from(readFileSync(dest))).toEqual([1, 2, 3, 4]);
  });

  it('overwrites an existing atlas slot', () => {
    const repo = fixtureRepo();
    const dest = resolve(repo, 'public/images/famous/m31.webp');
    writeFileSync(dest, Buffer.from([9, 9, 9, 9]));
    copyCuratedAtlas(repo, 'm31');
    expect(Array.from(readFileSync(dest))).toEqual([1, 2, 3, 4]);
  });

  it('throws when the source atlas.webp is missing', () => {
    const repo = fixtureRepo();
    expect(() => copyCuratedAtlas(repo, 'm99')).toThrow(/m99\/atlas\.webp/);
  });
});
