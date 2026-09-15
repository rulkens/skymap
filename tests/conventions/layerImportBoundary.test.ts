/**
 * layerImportBoundary — the ratchet that keeps `src/layers/**` a leaf a Layer's
 * `create` composes INTO core, never a dependency core reaches back into (the
 * inbound sweep), and keeps a Layer module from importing the slice it will
 * itself mint actions against (the outbound sweep) — D1's module-init cycle
 * risk: `settingsSlice` → `appSettingsFragments` → `app` → a Layer that reads
 * `settingsSlice` at module scope → `settingsSlice` again, the second entry
 * reading an uninitialised `const`. `oneMpcSeam.test.ts` is the ts-morph import
 * walk this copies; `frameFilePurity.test.ts` is the exact-count ALLOWED idiom.
 */
import { describe, it, expect } from 'vitest';
import { Project } from 'ts-morph';
import { readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return p.endsWith('.ts') || p.endsWith('.tsx') ? [p] : [];
  });
}

/** `src/a/b/File.ts` -> `a/b/File`, the ALLOWED-row key shape. */
function keyOf(file: string): string {
  return file.replace(/^src\//, '').replace(/\.tsx?$/, '');
}

const project = new Project({ useInMemoryFileSystem: false });

/**
 * Every specifier this file imports (type-only included — the boundary is
 * about knowledge, not bundles) that resolves under any of `prefixes`, relative
 * to the repo root. Non-relative specifiers (package imports) never resolve
 * under `src/`, so they never match.
 */
function specifiersUnder(file: string, prefixes: readonly string[]): string[] {
  const sourceFile = project.addSourceFileAtPath(file);
  const fromDir = dirname(file);
  return sourceFile
    .getImportDeclarations()
    .map((decl) => decl.getModuleSpecifierValue())
    .filter((specifier) => specifier.startsWith('.'))
    .filter((specifier) => {
      const resolved = relative(process.cwd(), resolve(fromDir, specifier)).replace(/\\/g, '/');
      return prefixes.some((prefix) => resolved.startsWith(prefix));
    });
}

/** One `it` per sweep: collects every file whose count is off its ALLOWED row into `offenders`, each entry carrying the same per-file diagnosis `assertRow` used to print alone. */
function assertSweep(
  files: readonly string[],
  prefixes: readonly string[],
  allowed: Readonly<Record<string, number>>,
  adviceForOverBudget: string,
) {
  const offenders = files.flatMap((file) => {
    const offending = specifiersUnder(file, prefixes);
    const key = keyOf(file);
    const budget = allowed[key] ?? 0;
    if (offending.length === budget) return [];
    return [
      `${file} imports ${offending.length} specifier(s) beyond its ALLOWED row ` +
        `('${key}': ${budget}): ${offending.join(', ') || 'none'}.`,
    ];
  });
  expect(offenders, [...offenders, adviceForOverBudget].join('\n')).toEqual([]);
}

// The one row Findings records: `settingsSlice.ts` imports the thirteen
// pre-Layer fragments directly for `liftClusterReducers`'s per-fragment
// spreads, which need each literal fragment type — this stays until reducers
// compose at the type level, not this PR. Every other engine/state file
// allows zero.
const ENGINE_AND_STATE_ALLOWED: Readonly<Record<string, number>> = {
  'state/settings/settingsSlice': 13,
};

describe('engine and state files import nothing from src/layers beyond their ALLOWED row', () => {
  const files = [...walk('src/services/engine'), ...walk('src/state')];
  expect(files.length).toBeGreaterThan(0);

  it('every file matches its ALLOWED row', () => {
    assertSweep(
      files,
      ['src/layers/'],
      ENGINE_AND_STATE_ALLOWED,
      'Over the row: a Layer contributes into core through Layer.create/passes/etc, ' +
        'not the other way — read the value through the composition, or raise the row ' +
        "here naming why (settingsSlice's row is the one precedent).",
    );
  });
});

// Free today: zero such imports at HEAD. This is the half that closes D1's
// cycle, so a Layer importing the slice fails here, naming the file, instead
// of crashing boot on an uninitialised `const` in a graph no unit test builds.
const LAYERS_ALLOWED: Readonly<Record<string, number>> = {};

describe('no file under src/layers imports src/state or src/store', () => {
  const files = walk('src/layers');
  expect(files.length).toBeGreaterThan(0);

  it('every file matches its ALLOWED row', () => {
    assertSweep(
      files,
      ['src/state/', 'src/store/'],
      LAYERS_ALLOWED,
      'A Layer mints its own createAction(s) rather than importing the slice — ' +
        "importing settingsSlice from a Layer module closes D1's module-init cycle " +
        '(settingsSlice -> appSettingsFragments -> app -> this Layer -> settingsSlice).',
    );
  });
});
