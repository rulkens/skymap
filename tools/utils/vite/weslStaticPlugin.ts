/**
 * weslStaticPlugin — links `import wgsl from './x.wesl?static'` into a WGSL
 * string module at build time, with the `wesl` linker.
 *
 * It reads its wesl.toml (`include` globs, `root`) and the shader sources ONCE
 * and shares them across every link; wesl-plugin, which this replaces, re-read
 * and re-parsed all of them per shader, which cost ~90% of `vite build` and
 * opened ~20k files at once. A `.wesl` or toml change drops the cache. Only
 * `package::` imports are supported: no npm WESL libraries, no conditions.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'smol-toml';
import { glob } from 'tinyglobby';
import { link } from 'wesl';
import type { Plugin } from 'vite';
import type { WeslProject } from '../../@types/vite/WeslProject';

const STATIC_ID = /^(?<file>[^?]+\.wesl)\?static$/;

const unixPath = (p: string): string => p.split(path.sep).join('/');

async function loadProject(tomlFile: string): Promise<WeslProject> {
  const tomlDir = path.dirname(tomlFile);
  const toml = parse(await readFile(tomlFile, 'utf8')) as { include: string[]; root: string };
  const root = path.resolve(tomlDir, toml.root);
  const files = await glob(toml.include, { cwd: tomlDir, absolute: true });
  const sources = await Promise.all(files.map((file) => readFile(file, 'utf8')));
  const weslSrc = Object.fromEntries(
    files.map((file, i) => [
      unixPath(path.relative(root, file)),
      sources[i]!.replace(/\r\n/g, '\n'),
    ]),
  );
  return { root, debugWeslRoot: unixPath(path.relative(tomlDir, root)), files, weslSrc };
}

/** `weslToml` defaults to `<cwd>/wesl.toml`; a tool run from the repo root passes its own. */
export function weslStaticPlugin(options: { weslToml?: string } = {}): Plugin {
  const tomlFile = path.resolve(options.weslToml ?? 'wesl.toml');
  let project: Promise<WeslProject> | null = null;
  return {
    name: 'skymap:wesl-static',
    enforce: 'pre',
    async load(id) {
      const file = STATIC_ID.exec(id)?.groups?.file;
      if (file === undefined) return null;
      const { root, debugWeslRoot, files, weslSrc } = await (project ??= loadProject(tomlFile));
      this.addWatchFile(tomlFile);
      for (const f of files) this.addWatchFile(f);
      const rootModuleName = unixPath(path.relative(root, file)).replace(/\.wesl$/, '');
      const { dest } = await link({ weslSrc, rootModuleName, debugWeslRoot });
      return `export const wgsl = ${JSON.stringify(dest)};\nexport default wgsl;\n`;
    },
    watchChange(id) {
      if (id.endsWith('.wesl') || path.resolve(id) === tomlFile) project = null;
    },
    // Dev: any shader can import the one that changed, so every linked
    // module is stale; returning them makes Vite reload their importers.
    hotUpdate({ file }) {
      if (!file.endsWith('.wesl') && path.resolve(file) !== tomlFile) return;
      project = null;
      const graph = this.environment.moduleGraph;
      const stale = [...graph.idToModuleMap.values()].filter(
        (mod) => mod.id !== null && STATIC_ID.test(mod.id),
      );
      for (const mod of stale) graph.invalidateModule(mod);
      return stale;
    },
  };
}
