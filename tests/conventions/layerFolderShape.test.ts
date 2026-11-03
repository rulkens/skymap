/**
 * Ratchet for ADR 0014: no folder under `src/layers/` holds more than 15 files
 * directly, no folder is named for a bag, and a regrouped Layer has no role
 * folder (`render/`, `ui/`, ...) at its root. The three allow-lists are
 * shrink-only: an entry must go when its folder or Layer is fixed, so none can
 * go stale. A Layer's regroup PR deletes its rows from them.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MAX_FILES = 15;
const ADR = 'docs/adrs/0014-layers-organised-by-concern-modules.md';
const BAG_NAMES = ['helpers', 'misc', 'common', 'shared', 'other'];
const ROLE_FOLDERS = [
  'render',
  'load',
  'present',
  'passes',
  'subsystems',
  'ui',
  'sagas',
  'utils',
  'data',
  'computes',
];

/** Folder → current direct file count. */
const OVERSIZED_FOLDERS: Record<string, number> = {
  'src/layers/body/@types': 37,
  'src/layers/body/bodies': 37,
  'src/layers/body/present': 35,
  'src/layers/body/render': 20,
  'src/layers/body/subsystems/surfaceTiles': 28,
  'src/layers/starCatalog/@types': 21,
};

/** Layers still organised by role at their root; regrouping a Layer deletes its name. */
const NOT_YET_REGROUPED: ReadonlySet<string> = new Set(['body', 'galaxyCatalog', 'starCatalog']);

function directories(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return [path, ...directories(path)];
    });
}

const allDirs = ['src/layers', ...directories('src/layers')];
const layerNames = readdirSync('src/layers', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

/** Dotfiles (`.DS_Store`) are not source. */
const fileCount = (dir: string): number =>
  readdirSync(dir, { withFileTypes: true }).filter(
    (entry) => entry.isFile() && !entry.name.startsWith('.'),
  ).length;

const rootRoleFolders = (layer: string): string[] =>
  readdirSync(join('src/layers', layer), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && ROLE_FOLDERS.includes(entry.name))
    .map((entry) => entry.name);

describe('Layer folder shape (ADR 0014)', () => {
  it(`no folder holds more than ${MAX_FILES} files beyond its allow-listed count`, () => {
    const violations = allDirs.flatMap((dir) => {
      const count = fileCount(dir);
      const allowed = OVERSIZED_FOLDERS[dir] ?? MAX_FILES;
      return count > allowed
        ? [
            `${dir}: ${count} files, allowed ${allowed}. Group files into concern modules or sub-folders (${ADR}).`,
          ]
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

  it('no folder at any depth is named for a bag', () => {
    const found = allDirs.filter((dir) => BAG_NAMES.includes(dir.split('/').at(-1) ?? ''));
    expect(
      found,
      `${found.join('\n')}\nName a folder for its concern, not its kind (${ADR}).`,
    ).toEqual([]);
  });

  it('a regrouped Layer has no role folder at its root', () => {
    const violations = layerNames
      .filter((layer) => !NOT_YET_REGROUPED.has(layer))
      .flatMap((layer) =>
        rootRoleFolders(layer).map(
          (role) =>
            `src/layers/${layer}/${role}/: role folders belong inside a concern module, <concern>/${role}/ (${ADR}).`,
        ),
      );
    expect(violations, violations.join('\n')).toEqual([]);
  });

  it('every not-yet-regrouped Layer still has a root role folder', () => {
    const stale = [...NOT_YET_REGROUPED].filter(
      (layer) => !layerNames.includes(layer) || rootRoleFolders(layer).length === 0,
    );
    expect(stale, `${stale.join(', ')}: regrouped or gone; delete from NOT_YET_REGROUPED.`).toEqual(
      [],
    );
  });
});
