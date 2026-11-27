/**
 * packages/mcpm-workbench may import itself and packages/shared freely, but any other repo file
 * (the app's `src/`, `tools/`, `public/`) only from the list below: the files it imported when it
 * moved (ADR 0017). The list only shrinks. A new import of an unlisted file fails, and so does a
 * listed file nothing imports any more, so the list stays exact. Bare specifiers (npm packages)
 * are not checked; neither are the package's own tests.
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cssSpecifiers } from '../helpers/conventions/cssSpecifiers';
import { tsSpecifiers } from '../helpers/conventions/tsSpecifiers';
import { walkFiles } from '../helpers/conventions/walkFiles';

const PACKAGE = 'packages/mcpm-workbench';
const FREE = [`${PACKAGE}/`, 'packages/shared/'];

const ALLOWED: ReadonlySet<string> = new Set([
  // Workbench-only helpers that stayed in src/.
  'src/components/common/Select/Select.tsx',
  'src/components/common/formControl.module.css',
  'src/components/icons/BounceIcon/BounceIcon.tsx',
  'src/components/icons/CubeIcon/CubeIcon.tsx',
  'src/components/icons/DatabaseIcon/DatabaseIcon.tsx',
  'src/components/icons/FilamentIcon/FilamentIcon.tsx',
  'src/components/icons/FloppyIcon/FloppyIcon.tsx',
  'src/components/icons/FolderOpenIcon/FolderOpenIcon.tsx',
  'src/components/icons/GaugeIcon/GaugeIcon.tsx',
  'src/components/icons/HistogramIcon/HistogramIcon.tsx',
  'src/components/icons/ImportIcon/ImportIcon.tsx',
  'src/components/icons/LoopPlayIcon/LoopPlayIcon.tsx',
  'src/components/icons/MarqueeIcon/MarqueeIcon.tsx',
  'src/components/icons/ParticlesIcon/ParticlesIcon.tsx',
  'src/components/icons/RayStepsIcon/RayStepsIcon.tsx',
  'src/components/icons/SpiralIcon/SpiralIcon.tsx',
  'src/utils/browser/cssVar.ts',
  'src/utils/math/withAxis.ts',
  'src/utils/random/uniformInSphere.ts',
  // MCPM shaders: one WESL package root, src/services/gpu/shaders (wesl-shaders skill).
  'src/services/gpu/shaders/mcpm/boxLines.wesl',
  'src/services/gpu/shaders/mcpm/decay.wesl',
  'src/services/gpu/shaders/mcpm/fragment.wesl',
  'src/services/gpu/shaders/mcpm/galaxyPoints.wesl',
  'src/services/gpu/shaders/mcpm/histogram.wesl',
  'src/services/gpu/shaders/mcpm/propagate.wesl',
  'src/services/gpu/shaders/mcpm/splatBlit.wesl',
  'src/services/gpu/shaders/mcpm/splatTransform.wesl',
  'src/services/gpu/shaders/mcpm/traceUpsample.wesl',
  'src/services/gpu/shaders/mcpm/vertex.wesl',
  'src/services/gpu/shaders/mcpm/volpath.wesl',
  'src/services/gpu/shaders/mcpm/volpathBlit.wesl',
  // The galaxy catalogs the workbench seeds agents from.
  'src/compositions/appSources.ts',
  'src/layers/galaxyCatalog/@types/GalaxyCatalogId.d.ts',
  'src/layers/galaxyCatalog/records/data/galaxyCatalogFormat.ts',
  'src/layers/galaxyCatalog/records/data/tierTargets.ts',
  // Tool helpers.
  'tools/@types/input/InputGestureEvent.d.ts',
  'tools/parsers/npyReader.ts',
  'tools/parsers/npyWriter.ts',
  'tools/parsers/polyphyTraceSidecar.ts',
  'tools/utils/camera/orbitDragDelta.ts',
  'tools/utils/input/attachOrbitControls.ts',
  'tools/utils/input/createInputAggregator.ts',
  'tools/utils/io/devPorts.ts',
  'tools/utils/io/distDir.ts',
  'tools/utils/io/toolPages.ts',
  'tools/utils/math/f16BitsToFloat.ts',
  'tools/utils/vite/weslStaticPlugin.ts',
  // Skymap's own icon, drawn in the Data panel.
  'public/favicon.svg',
]);

const isFile = (path: string) => existsSync(path) && statSync(path).isFile();

// Repo-relative file a relative specifier names; `?static`/`?worker` and an omitted extension allowed.
function targetOf(file: string, spec: string): string {
  const base = relative(process.cwd(), resolve(join(dirname(file), spec.replace(/\?.*$/, ''))));
  const path = ['', '.ts', '.tsx', '.d.ts', '/index.ts'].map((ext) => base + ext).find(isFile);
  return (path ?? base).replace(/\\/g, '/');
}

function outsideTargets(file: string): string[] {
  return (file.endsWith('.css') ? cssSpecifiers(file) : tsSpecifiers(file))
    .filter((spec) => spec.startsWith('.'))
    .map((spec) => targetOf(file, spec))
    .filter((target) => !FREE.some((root) => target.startsWith(root)));
}

const files = walkFiles(PACKAGE, ['.ts', '.tsx', '.css']).filter(
  (file) => !file.startsWith(`${PACKAGE}/tests/`),
);
const imported = new Set(files.flatMap(outsideTargets));

describe('packages/mcpm-workbench imports from outside itself and packages/shared only what is listed', () => {
  expect(files.length).toBeGreaterThan(0);

  it.each(files)('%s', (file) => {
    expect(
      outsideTargets(file).filter((target) => !ALLOWED.has(target)),
      'Import it from packages/shared (move it there with its own imports), or move it into the ' +
        'workbench if only the workbench uses it.',
    ).toEqual([]);
  });

  it('lists only files the workbench still imports', () => {
    expect(
      [...ALLOWED].filter((path) => !imported.has(path)),
      'Nothing imports these any more: delete them from ALLOWED.',
    ).toEqual([]);
  });
});
