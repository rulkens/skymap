/**
 * layerImportBoundary — the ratchet that keeps `src/layers/**` a leaf a Layer's
 * `create` composes INTO core, never a dependency core reaches back into (the
 * inbound sweep), and keeps a Layer module from importing the slice it will
 * itself mint actions against (the outbound sweep) — D1's module-init cycle
 * risk: a Layer's own `<cluster>Slice` → `appSettingsSlices` →
 * `combinedSettingsReducer` → a Layer that reads its own slice module at
 * module scope → that slice again, the second entry reading an uninitialised
 * `const`. `oneMpcSeam.test.ts` is the ts-morph import walk this copies;
 * `frameFilePurity.test.ts` is the exact-count ALLOWED idiom.
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
 * Every specifier this file imports OR re-exports (type-only included — the
 * boundary is about knowledge, not bundles) that resolves under any of
 * `prefixes`, relative to the repo root. A re-export (`export { x } from '…'`)
 * carries the same knowledge as an import — a barrel forwarding a Layer's
 * action creators would otherwise dodge this sweep entirely. Non-relative
 * specifiers (package imports) never resolve under `src/`, so they never match.
 */
function specifiersUnder(file: string, prefixes: readonly string[]): string[] {
  const sourceFile = project.addSourceFileAtPath(file);
  const fromDir = dirname(file);
  return [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
    .map((decl) => decl.getModuleSpecifierValue())
    .filter((specifier): specifier is string => specifier?.startsWith('.') ?? false)
    .filter((specifier) => {
      const resolved = relative(process.cwd(), resolve(fromDir, specifier)).replace(/\\/g, '/');
      return prefixes.some((prefix) => resolved.startsWith(prefix));
    });
}

/** Collects every file whose count is off its ALLOWED row, without asserting. */
function sweepOffenders(
  files: readonly string[],
  prefixes: readonly string[],
  allowed: Readonly<Record<string, number>>,
): string[] {
  return files.flatMap((file) => {
    const offending = specifiersUnder(file, prefixes);
    const key = keyOf(file);
    const budget = allowed[key] ?? 0;
    if (offending.length === budget) return [];
    return [
      `${file} imports ${offending.length} specifier(s) beyond its ALLOWED row ` +
        `('${key}': ${budget}): ${offending.join(', ') || 'none'}.`,
    ];
  });
}

/** One `it` per sweep: asserts `sweepOffenders` came back empty. */
function assertSweep(
  files: readonly string[],
  prefixes: readonly string[],
  allowed: Readonly<Record<string, number>>,
  adviceForOverBudget: string,
) {
  const offenders = sweepOffenders(files, prefixes, allowed);
  expect(offenders, [...offenders, adviceForOverBudget].join('\n')).toEqual([]);
}

// Both dispatch an action creator a Layer owns — core writing INTO a Layer's
// cluster. Neither is a decision: both Layers are still settings-only folders,
// so there is nowhere else for the work to live. DELETE each row as its Layer
// forms — `uploadVolumeField` becomes volume's slot wiring, and the tier ->
// milkyWay put becomes a `milkyWay/sagas/` watcher.
const ENGINE_AND_STATE_ALLOWED: Readonly<Record<string, number>> = {
  'services/engine/volume/uploadVolumeField': 1,
  'state/tier/watchTierSaga': 1,
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
        'here naming why.',
    );
  });
});

// A Layer's `ui/` and `sagas/` sections are exempt from BOTH sweeps below:
// `LayerUiSection` is a hand-written settings container (ADR 0011), and a
// settings container's whole job — read the store, dispatch on a change —
// has always meant store reach, in `src/components/containers/` or here. A
// declared `Layer.sagas` watcher is symmetric: reacting to a core action
// (`takeEvery(setPaletteOpen, ...)`) and reading store-owned saga-context
// types is what a saga IS, exactly like every core watcher under
// `src/state/**`. The ban stays absolute for every other Layer file
// (create/frame/passes/etc — D1's cycle risk for the import sweep, the
// outbound seam below for the dispatch sweep).
const LAYER_STORE_REACH_DIRS = ['/ui/', '/sagas/'];

// A Layer's own `state/<slice>/selectors.ts` may import exactly `selectSettings`
// from `state/settings/selectSettings.ts` — that chain stops at `store/constants.ts`
// and never reaches `rootReducer`/`combinedSettingsReducer`/`appSettingsSlices`, so it
// can't reopen D1's module-init cycle. A rule, not 16 ALLOWED rows, so a new Layer is covered.
const SLICE_SELECTORS_FILE = /^src\/layers\/[^/]+\/state\/[^/]+\/selectors\.ts$/;
const SELECT_SETTINGS_MODULE = 'src/state/settings/selectSettings';

function selectorsCarveOutOffenders(files: readonly string[]): string[] {
  return files.flatMap((file) => {
    const specifiers = specifiersUnder(file, ['src/state/', 'src/store/']);
    const fromDir = dirname(file);
    const resolvedOk =
      specifiers.length === 1 &&
      relative(process.cwd(), resolve(fromDir, specifiers[0]!)).replace(/\\/g, '/') ===
        SELECT_SETTINGS_MODULE;
    return resolvedOk
      ? []
      : [
          `${file} must import exactly '${SELECT_SETTINGS_MODULE}' from src/state or ` +
            `src/store; found: ${specifiers.join(', ') || 'none'}.`,
        ];
  });
}

describe('no file under src/layers imports src/state or src/store (outside ui/sagas)', () => {
  const files = walk('src/layers').filter(
    (file) => !LAYER_STORE_REACH_DIRS.some((dir) => file.includes(dir)),
  );
  expect(files.length).toBeGreaterThan(0);

  it('every file matches its ALLOWED row', () => {
    const sliceSelectorsFiles = files.filter((file) => SLICE_SELECTORS_FILE.test(file));
    const otherFiles = files.filter((file) => !SLICE_SELECTORS_FILE.test(file));
    const offenders = [
      ...selectorsCarveOutOffenders(sliceSelectorsFiles),
      ...sweepOffenders(otherFiles, ['src/state/', 'src/store/'], {}),
    ];
    expect(
      offenders,
      [
        ...offenders,
        'A Layer contributes a fact, a dep field or nothing — see the no-dispatch ' +
          "sweep below; importing state/settings from a Layer module also closes D1's " +
          "module-init cycle (this Layer's own slice -> appSettingsSlices -> " +
          'combinedSettingsReducer -> this Layer -> its slice).',
      ].join('\n'),
    ).toEqual([]);
  });
});

// The import ban alone does not close the outbound seam: `LayerCoreDeps.store`
// is handed to every Layer, so one could mint its own `createAction` and
// dispatch it — the improvisation the error message above would otherwise
// invite. Zero at HEAD outside `ui/`/`sagas/`, and every store write in the
// runtime sequence is a `deps` field, a published fact, `put()` from a
// declared saga, or deleted (Ruling 17).
describe('no file under src/layers dispatches (outside ui/sagas)', () => {
  const files = walk('src/layers').filter(
    (file) => !LAYER_STORE_REACH_DIRS.some((dir) => file.includes(dir)),
  );
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
