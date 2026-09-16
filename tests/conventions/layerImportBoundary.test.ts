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
import { readdirSync, readFileSync, statSync } from 'node:fs';
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

// `settingsSlice.ts` imports each pre-Layer fragment directly, and a formed
// Layer's settings tuple as one specifier, for `liftClusterReducers`'s
// per-fragment spreads — each needs its literal fragment type. This stays until
// reducers compose at the type level, not this PR.
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

// Free today except a Layer's OWN `ui` section: `LayerUiSection` is a
// hand-written settings container (ADR 0011), and a settings container's
// whole job — read the store, dispatch on a change — has always meant store
// reach, in `src/components/containers/` or here. The ban still holds for
// every other Layer file (create/frame/passes/etc — D1's cycle risk), so
// this is a one-file carve-out, not a loosened rule.
const LAYERS_ALLOWED: Readonly<Record<string, number>> = {
  'layers/galaxyCatalog/ui/GalaxiesSectionContainer': 4,
};

describe('no file under src/layers imports src/state or src/store', () => {
  const files = walk('src/layers');
  expect(files.length).toBeGreaterThan(0);

  it('every file matches its ALLOWED row', () => {
    assertSweep(
      files,
      ['src/state/', 'src/store/'],
      LAYERS_ALLOWED,
      'A Layer contributes a fact, a dep field or nothing — see the no-dispatch ' +
        "sweep below; importing settingsSlice from a Layer module also closes D1's " +
        'module-init cycle (settingsSlice -> appSettingsFragments -> app -> this ' +
        'Layer -> settingsSlice).',
    );
  });
});

// The import ban alone does not close the outbound seam: `LayerCoreDeps.store`
// is handed to every Layer, so one could mint its own `createAction` and
// dispatch it — the improvisation the error message above would otherwise
// invite. Zero at HEAD outside `ui/`, and every store write in the runtime
// sequence is a `deps` field, a published fact, or deleted (Ruling 17). A
// Layer's `ui/` section is exempt for the same reason as the sweep above:
// it is a settings container, and every settings container dispatches.
describe('no file under src/layers dispatches (outside a Layer ui/ section)', () => {
  const files = walk('src/layers').filter((file) => !file.includes('/ui/'));
  expect(files.length).toBeGreaterThan(0);

  it('every file is free of a .dispatch( call', () => {
    const offenders = files.filter((file) => readFileSync(file, 'utf8').includes('.dispatch('));
    expect(
      offenders,
      `${offenders.join(', ')} dispatches from under src/layers. A Layer reports ` +
        'through a `deps` callback core owns (reportSourceCount) or publishes a ' +
        'fact (deps.publish) — core decides what the pulse means.',
    ).toEqual([]);
  });
});
