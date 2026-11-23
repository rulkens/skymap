import type { Engine } from '../../../tools/@types/refactor/Engine';
import { closeEngine } from '../../../tools/utils/refactor/engine/closeEngine';
import { openEngine } from '../../../tools/utils/refactor/engine/openEngine';

const TSCONFIG = JSON.stringify({
  compilerOptions: { strict: true, noEmit: true, module: 'ESNext', moduleResolution: 'bundler' },
  include: ['*.ts'],
});

/** An engine over a small in-memory project: `files` maps a root-relative path to its text. */
export function engineFixture(
  files: Record<string, string>,
  projects: readonly string[] = ['tsconfig.json'],
): { engine: Engine; root: string; dispose: () => void } {
  const root = '/fixture';
  const absolute: Record<string, string> = {};
  for (const [name, text] of Object.entries(files)) absolute[`${root}/${name}`] = text;
  for (const name of projects) absolute[`${root}/${name}`] ??= TSCONFIG;
  const engine = openEngine({ root, projects, files: absolute });
  return { engine, root, dispose: () => closeEngine(engine) };
}
