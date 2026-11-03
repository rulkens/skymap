/**
 * Ratchet for ADR 0014: no folder under `src/layers/` holds more than 15 files
 * directly, and a Layer's top-level folders are never named for a kind of file
 * (`helpers`, `utils`, ...). Both allow-lists are shrink-only: an entry must
 * drop (or go) when its folder does, so neither list can go stale.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MAX_FILES = 15;
const ADR = 'docs/adrs/0014-layers-organised-by-concern-modules.md';
const BANNED_MODULE_NAMES = ['helpers', 'misc', 'common', 'shared', 'other', 'utils'];

/** Folder → current direct file count; regrouping a Layer into modules deletes its rows. */
const OVERSIZED_FOLDERS: Record<string, number> = {
  'src/layers/body/@types': 37,
  'src/layers/body/bodies': 34,
  'src/layers/body/present': 34,
  'src/layers/body/render': 20,
  'src/layers/body/subsystems/surfaceTiles': 28,
  'src/layers/starCatalog/@types': 21,
};

/** Top-level `utils/` folders that predate the ADR; the Layer's regroup moves them into a module. */
const LEGACY_TOP_LEVEL_UTILS: ReadonlySet<string> = new Set(['src/layers/structure/utils']);

function directories(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return [path, ...directories(path)];
    });
}

const allDirs = ['src/layers', ...directories('src/layers')];
const fileCount = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isFile()).length;

describe('Layer folder shape (ADR 0014)', () => {
  it(`no folder holds more than ${MAX_FILES} files beyond its allow-listed count`, () => {
    const violations = allDirs.flatMap((dir) => {
      const count = fileCount(dir);
      const allowed = OVERSIZED_FOLDERS[dir] ?? MAX_FILES;
      return count > allowed
        ? [`${dir}: ${count} files, allowed ${allowed}. Group files into concern modules (${ADR}).`]
        : [];
    });
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('allow-listed folders still exceed the cap, and their counts only shrink', () => {
    const stale = Object.entries(OVERSIZED_FOLDERS).flatMap(([dir, allowed]) => {
      if (!allDirs.includes(dir)) return [`${dir}: gone; delete its OVERSIZED_FOLDERS row.`];
      const count = fileCount(dir);
      return count <= MAX_FILES || count < allowed
        ? [
            `${dir}: now ${count} files (listed ${allowed}); lower the row, or delete it at ${MAX_FILES} or fewer.`,
          ]
        : [];
    });
    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('no Layer folder is named for a kind of file instead of a concern', () => {
    const layers = readdirSync('src/layers', { withFileTypes: true }).filter((e) =>
      e.isDirectory(),
    );
    const found = layers.flatMap((layer) =>
      readdirSync(join('src/layers', layer.name), { withFileTypes: true })
        .filter((e) => e.isDirectory() && BANNED_MODULE_NAMES.includes(e.name))
        .map((e) => join('src/layers', layer.name, e.name)),
    );
    const violations = found.filter((dir) => !LEGACY_TOP_LEVEL_UTILS.has(dir));
    const stale = [...LEGACY_TOP_LEVEL_UTILS].filter((dir) => !found.includes(dir));
    expect(
      violations,
      `${violations.join('\n')}\nName a module for its concern, not its kind (${ADR}).`,
    ).toEqual([]);
    expect(stale, `${stale.join('\n')}\nGone; delete its LEGACY_TOP_LEVEL_UTILS entry.`).toEqual(
      [],
    );
  });
});
