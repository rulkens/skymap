/**
 * A render shader under `src/services/gpu/shaders/` (a folder whose `.wesl` declares an `@vertex`
 * entry; `lib/` is shared code, compute-only folders are out of scope) is split by stage: an
 * `io.wesl` for the varyings, `@vertex` entries only in `vertex*.wesl`, `@fragment` entries only in
 * `fragment*.wesl` / `*Fragment.wesl` — so no file holds both stages. All-in-one shaders kept
 * shipping through review while this lived only in the wesl-shaders skill, hence a ratchet.
 * `ALLOWED` is today's debt, keyed by folder; rows only ever go DOWN, and a row whose folder now
 * conforms (or is gone) fails until it is deleted.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SHADERS_DIR = fileURLToPath(new URL('../../src/services/gpu/shaders/', import.meta.url));

const ALLOWED: readonly string[] = [
  'antiqueLook',
  'atmosphere/aerialPerspective',
  'atmosphere/shell',
  'bloom',
  'bodies',
  'bodies/blackHoleLensing',
  'bodies/earth/antiqueMap',
  'bodies/star',
  'cubeFaceBlit',
  'labels',
  'localBubble',
  'mcpm',
  'milkyWay/field/dustPresent',
  'milkyWay/ismMap',
  'milkyWay/pick',
  'milkyWay/sprites',
  'prefilterCube',
  'satellites/points',
  'scalarVolume',
  'structureMarker',
];

const VERTEX_FILE = /^vertex\w*\.wesl$/;
const FRAGMENT_FILE = /^(fragment\w*|\w+Fragment)\.wesl$/;

// Comments name entry points too (`// the '@fragment fn fs' entry…`), so strip them first.
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

type Folder = { readonly key: string; readonly files: ReadonlyMap<string, string> };

function foldersUnder(dir: string, key: string): Folder[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files = new Map(
    entries
      .filter((e) => e.isFile() && e.name.endsWith('.wesl'))
      .map((e) => [e.name, stripComments(readFileSync(`${dir}${e.name}`, 'utf8'))] as const),
  );
  const subfolders = entries
    .filter((e) => e.isDirectory() && !(key === '' && e.name === 'lib'))
    .flatMap((e) => foldersUnder(`${dir}${e.name}/`, key ? `${key}/${e.name}` : e.name));
  return [{ key, files }, ...subfolders];
}

const declares = (src: string, stage: 'vertex' | 'fragment'): boolean =>
  new RegExp(`@${stage}\\b`).test(src);

const renderFolders = foldersUnder(SHADERS_DIR, '').filter(({ files }) =>
  [...files.values()].some((src) => declares(src, 'vertex')),
);

function problemsOf({ files }: Folder): string[] {
  const missingIo = files.has('io.wesl') ? [] : ['no io.wesl'];
  const misplaced = [...files].flatMap(([name, src]) => [
    ...(declares(src, 'vertex') && !VERTEX_FILE.test(name) ? [`@vertex in ${name}`] : []),
    ...(declares(src, 'fragment') && !FRAGMENT_FILE.test(name) ? [`@fragment in ${name}`] : []),
  ]);
  return [...missingIo, ...misplaced];
}

it('every ALLOWED row names a render-shader folder', () => {
  const keys = new Set(renderFolders.map((f) => f.key));
  const dangling = ALLOWED.filter((key) => !keys.has(key));
  expect(dangling, 'ALLOWED rows with no render-shader folder: rename or delete them').toEqual([]);
});

describe('render shader folders split io / vertex / fragment', () => {
  expect(renderFolders.length).toBeGreaterThan(0);

  it.each(renderFolders.map((f) => [f.key, f] as const))('%s', (key, folder) => {
    const problems = problemsOf(folder);
    if (ALLOWED.includes(key)) {
      expect(
        problems.length,
        `${key} conforms now: delete its ALLOWED row in the same commit`,
      ).toBeGreaterThan(0);
      return;
    }
    expect(
      problems,
      `${key}: varyings go in io.wesl, each @vertex entry in vertex*.wesl, each @fragment entry ` +
        'in fragment*.wesl or <variant>Fragment.wesl (see the wesl-shaders skill, "File layout")',
    ).toEqual([]);
  });
});
