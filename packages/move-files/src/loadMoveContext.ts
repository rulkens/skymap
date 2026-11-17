/**
 * loadMoveContext: the project's companion rules and tsconfig aliases.
 *
 * `move-files.config.json` is optional (no file means no companions). Aliases
 * come from every `tsconfig*.json` and `jsconfig*.json`, one scope per folder, so
 * the nearest folder governs an importer; configs sharing a folder pool their
 * targets, since a Vite `tsconfig.app.json` holds what `tsconfig.json` only
 * references. `extends` is followed by hand, later parents winning key by key;
 * `paths` resolves against `baseUrl` if set, else the config that declares it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import ts from 'typescript';
import type { AliasRule } from './@types/AliasRule';
import type { AliasScope } from './@types/AliasScope';
import type { MoveConfig } from './@types/MoveConfig';
import type { MoveContext } from './@types/MoveContext';
import type { TsconfigChain } from './@types/TsconfigChain';

const CONFIG_FILE = /^[jt]sconfig.*\.json$/;

const inConfigDir = (value: string, configDir: string) =>
  value.replace('${configDir}', () => configDir);

function readChain(
  file: string,
  root: string,
  configDir: string,
  ancestors: readonly string[] = [],
): TsconfigChain {
  if (ancestors.includes(file) || !existsSync(file)) return {};
  const json = ts.readConfigFile(file, ts.sys.readFile).config ?? {};
  const dir = posix.dirname(file);
  let chain: TsconfigChain = {};
  const parents: unknown[] = [json.extends].flat().filter((e) => typeof e === 'string');
  for (const parent of parents as string[]) {
    const withExt = parent.endsWith('.json') ? parent : `${parent}.json`;
    const base = parent.startsWith('.')
      ? posix.resolve(dir, withExt)
      : posix.join(root, 'node_modules', withExt);
    chain = { ...chain, ...readChain(base, root, configDir, [...ancestors, file]) };
  }
  const options = json.compilerOptions ?? {};
  if (options.baseUrl !== undefined)
    chain = { ...chain, baseUrl: posix.resolve(dir, inConfigDir(options.baseUrl, configDir)) };
  if (options.paths !== undefined) chain = { ...chain, paths: options.paths, pathsDir: dir };
  return chain;
}

function rulesOf(file: string, root: string): AliasRule[] {
  const configDir = posix.dirname(file);
  const { paths = {}, pathsDir = configDir, baseUrl } = readChain(file, root, configDir);
  const entries = Object.entries(paths);
  // `baseUrl` alone maps every bare specifier beneath it; an explicit `*` path replaces that.
  if (baseUrl !== undefined && !('*' in paths)) entries.push(['*', ['*']]);
  return entries.map(([pattern, targets]) => ({
    pattern,
    targets: targets.map((t) => posix.resolve(baseUrl ?? pathsDir, inConfigDir(t, configDir))),
  }));
}

function scopesOf(configs: readonly string[], root: string): AliasScope[] {
  const byFolder = new Map<string, Map<string, string[]>>();
  for (const file of configs) {
    const dir = posix.dirname(file);
    const targetsByPattern = byFolder.get(dir) ?? new Map<string, string[]>();
    byFolder.set(dir, targetsByPattern);
    for (const { pattern, targets } of rulesOf(file, root)) {
      const pooled = [...(targetsByPattern.get(pattern) ?? []), ...targets];
      targetsByPattern.set(pattern, [...new Set(pooled)]);
    }
  }
  return [...byFolder].map(([dir, targetsByPattern]) => ({
    dir,
    rules: [...targetsByPattern].map(([pattern, targets]) => ({ pattern, targets })),
  }));
}

function readConfig(root: string): MoveConfig {
  const file = posix.join(root, 'move-files.config.json');
  if (!existsSync(file)) return { companions: [] };
  return { companions: JSON.parse(readFileSync(file, 'utf8')).companions ?? [] };
}

export function loadMoveContext(root: string, paths: readonly string[]): MoveContext {
  const configs = paths.filter((p) => CONFIG_FILE.test(posix.basename(p)));
  return { root, config: readConfig(root), aliasScopes: scopesOf(configs, root) };
}
