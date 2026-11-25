/**
 * Store wiring lives in containers: under a scope's UI roots, only a file in its containers folder
 * imports a store module (the typed hooks, react-redux). A component takes props, and its
 * `<Name>Container` reads selectors and dispatches; the app's `src/components/containers/` is the
 * precedent. Owner rule of 2026-11-26. `allowed` is today's debt and only shrinks: a listed file must
 * still touch the store. Adding the app or another tool is one more SCOPES row: its UI roots, its
 * containers folder(s), its store modules (repo-relative path without extension, or a package
 * name), its composition root(s), and the files touching the store today as `allowed`.
 */
import { dirname, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOnlyProject } from '../helpers/conventions/parseOnlyProject';
import { walkFiles } from '../helpers/conventions/walkFiles';

type Scope = {
  readonly name: string;
  readonly roots: readonly string[];
  readonly containers: readonly string[];
  readonly storeModules: readonly string[];
  /** Where the store is built and the `<Provider>` mounted: wiring by definition, never a component. */
  readonly compositionRoots: readonly string[];
  readonly allowed: readonly string[];
};

const SCOPES: readonly Scope[] = [
  {
    name: 'mcpm-workbench',
    roots: ['tools/mcpm-workbench/src/ui'],
    containers: ['tools/mcpm-workbench/src/ui/containers'],
    storeModules: ['tools/mcpm-workbench/src/store/hooks', 'react-redux'],
    compositionRoots: ['tools/mcpm-workbench/src/ui/App/App.tsx'],
    allowed: [
      'tools/mcpm-workbench/src/ui/catalog/CatalogStatus/CatalogStatus.tsx',
      'tools/mcpm-workbench/src/ui/catalog/LoadCatalogDialog/GridInfo/GridInfo.tsx',
      'tools/mcpm-workbench/src/ui/catalog/LoadCatalogDialog/LoadCatalogDialog.tsx',
      'tools/mcpm-workbench/src/ui/catalog/UserCatalogRow/UserCatalogRow.tsx',
      'tools/mcpm-workbench/src/ui/export/FileActions/FileActions.tsx',
      'tools/mcpm-workbench/src/ui/sidebars/DataPanel/DataPanel.tsx',
      'tools/mcpm-workbench/src/ui/sidebars/DataPanel/usePauseSimWhileOpen.ts',
      'tools/mcpm-workbench/src/ui/sim/DeviceLostToast/DeviceLostToast.tsx',
      'tools/mcpm-workbench/src/ui/sim/HistogramPlot/HistogramPlot.tsx',
      'tools/mcpm-workbench/src/ui/sim/HistogramReadout/HistogramReadout.tsx',
      'tools/mcpm-workbench/src/ui/sim/SimulationStatusIcon/SimulationStatusIcon.tsx',
      'tools/mcpm-workbench/src/ui/sim/SimulationStatusIcon/useFrameRateZone.ts',
      'tools/mcpm-workbench/src/ui/sim/SimulationTip/FrameRateValue/FrameRateValue.tsx',
      'tools/mcpm-workbench/src/ui/sim/SimulationTip/SimulationTip.tsx',
      'tools/mcpm-workbench/src/ui/sim/SimulationTip/StepCountValue/StepCountValue.tsx',
      'tools/mcpm-workbench/src/ui/sim/StatsReadout/StatsReadout.tsx',
      'tools/mcpm-workbench/src/ui/sim/StatsSummary/StatsSummary.tsx',
      'tools/mcpm-workbench/src/ui/grid/SelectionControls/SelectionControls.tsx',
      'tools/mcpm-workbench/src/ui/render/AgentsRows/AgentsRows.tsx',
      'tools/mcpm-workbench/src/ui/render/PathTracerRows/PathTracerRows.tsx',
      'tools/mcpm-workbench/src/ui/render/RaymarchRows/RaymarchRows.tsx',
      'tools/mcpm-workbench/src/ui/sidebars/ControlsPanel/ControlsPanel.tsx',
    ],
  },
];

/** The store modules `file` imports or re-exports; a relative specifier is resolved first. */
function storeImports(file: string, storeModules: readonly string[]): string[] {
  const sourceFile = parseOnlyProject.addSourceFileAtPath(file);
  return [...sourceFile.getImportDeclarations(), ...sourceFile.getExportDeclarations()]
    .map((decl) => decl.getModuleSpecifierValue())
    .filter((specifier) => specifier !== undefined)
    .map((specifier) =>
      specifier.startsWith('.')
        ? relative(process.cwd(), resolve(dirname(file), specifier)).replace(/\\/g, '/')
        : specifier,
    )
    .filter((module) => storeModules.includes(module));
}

describe.each(SCOPES)('$name: only containers touch the store', (scope) => {
  const inContainers = (file: string) => scope.containers.some((dir) => file.startsWith(`${dir}/`));
  const files = scope.roots
    .flatMap((root) => walkFiles(root, ['.ts', '.tsx']))
    .filter((file) => !/\.(test|d)\.tsx?$/.test(file) && !inContainers(file))
    .filter((file) => !scope.compositionRoots.includes(file));
  expect(files.length).toBeGreaterThan(0);
  const listed = new Set(scope.allowed);

  it('every composition root exists and builds the store', () => {
    for (const file of scope.compositionRoots)
      expect(storeImports(file, scope.storeModules), file).not.toEqual([]);
  });

  it.each(files.filter((f) => !listed.has(f)))('%s', (file) => {
    expect(
      storeImports(file, scope.storeModules),
      `Move the store wiring into ${scope.containers[0]}/<concern>/<Name>Container.tsx: ` +
        'it reads the selectors and dispatches, and renders this component with props.',
    ).toEqual([]);
  });

  it.each(scope.allowed)('%s still touches the store (split? drop its allowed row)', (file) => {
    expect(files).toContain(file);
    expect(storeImports(file, scope.storeModules)).not.toEqual([]);
  });
});
