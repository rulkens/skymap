/**
 * Ratchet for ADRs 0014 and 0015: no folder under `src/layers/`, the camera
 * trees, `packages/desktop/src/` or `packages/studio/src/` holds more than 15 files directly, no folder is named for a bag, and a
 * regrouped Layer has no role folder (`render/`, `ui/`, ...) at its root. The three allow-lists are
 * shrink-only: an entry must go when its folder or Layer is fixed, so none can
 * go stale. A Layer's regroup PR deletes its rows from them. Every Layer's selection
 * kinds and row sit flat in `src/layers/<layer>/selection/`, the one exception to
 * `<concern>/<role>/`, so they are found in one place.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const MAX_FILES = 15;
const ADR = 'docs/adrs/0014-layers-organised-by-concern-modules.md';
const CONCERN_ROOTS = [
  'src/layers',
  'src/services/engine/camera',
  'src/utils/camera',
  'src/@types/camera',
  'src/data/camera',
  // The desktop app and the studio package follow the same concern-module shape.
  'packages/desktop/src',
  'packages/studio/src',
];
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
const OVERSIZED_FOLDERS: Record<string, number> = {};

/** Layers still organised by role at their root; regrouping a Layer deletes its name. */
const NOT_YET_REGROUPED: ReadonlySet<string> = new Set();

function directories(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      return [path, ...directories(path)];
    });
}

const allDirs = CONCERN_ROOTS.flatMap((root) => [root, ...directories(root)]);
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

describe('Concern folder shape (ADRs 0014, 0015)', () => {
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

const README = 'src/layers/README.md';
const selectionFolder = (layer: string): string => `src/layers/${layer}/selection`;
const isSelectionDeclaration = (name: string): boolean =>
  name === 'kinds.ts' || name.endsWith('SelectionRow.ts');

describe('selection/ module placement (src/layers/README.md)', () => {
  it("every kinds.ts and *SelectionRow.ts sits at the root of its Layer's selection/", () => {
    const misplaced = allDirs
      .filter((dir) => dir.startsWith('src/layers/'))
      .flatMap((dir) =>
        readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isFile() && isSelectionDeclaration(entry.name))
          .map((entry) => join(dir, entry.name)),
      )
      .filter((file) => !/^src\/layers\/[^/]+\/selection\/[^/]+$/.test(file));
    expect(
      misplaced,
      `${misplaced.join('\n')}\nMove it to src/layers/<layer>/selection/ (${README}).`,
    ).toEqual([]);
  });

  it('no selection/ folder sits anywhere but a Layer root', () => {
    const roots = new Set(layerNames.map(selectionFolder));
    const stray = allDirs.filter(
      (dir) => dir.startsWith('src/layers/') && dir.endsWith('/selection') && !roots.has(dir),
    );
    expect(
      stray,
      `${stray.join('\n')}\nSelection lives in src/layers/<layer>/selection/ only.`,
    ).toEqual([]);
  });

  it('every Layer that declares selection has selection/kinds.ts', () => {
    const missing = layerNames
      .filter((layer) =>
        /^\s*selection:/m.test(readFileSync(join('src/layers', layer, 'layer.ts'), 'utf8')),
      )
      .filter((layer) => !existsSync(join(selectionFolder(layer), 'kinds.ts')));
    expect(
      missing,
      `${missing.join(', ')}: declare selection kinds in selection/kinds.ts.`,
    ).toEqual([]);
  });
});
