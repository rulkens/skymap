/**
 * loadMoveContext: the project's companion rules and tsconfig aliases.
 *
 * `move-files.config.json` is optional (no file means no companions). Aliases
 * come from every tsconfig among `paths`, one scope each, so the nearest one
 * governs an importer. `extends` is followed by hand: `paths` is replaced, not
 * merged, by a child, and resolves against `baseUrl` if any config in the
 * chain sets one, else against the config that declares `paths`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { posix } from 'node:path';
import ts from 'typescript';
import type { AliasRule } from './@types/AliasRule';
import type { AliasScope } from './@types/AliasScope';
import type { MoveConfig } from './@types/MoveConfig';
import type { MoveContext } from './@types/MoveContext';
import type { TsconfigChain } from './@types/TsconfigChain';

function readTsconfigChain(file: string, root: string, seen = new Set<string>()): TsconfigChain {
  const empty: TsconfigChain = { pathsDir: posix.dirname(file) };
  if (seen.has(file) || !existsSync(file)) return empty;
  seen.add(file);
  const json = ts.readConfigFile(file, ts.sys.readFile).config ?? {};
  const dir = posix.dirname(file);
  const parents: unknown[] = [json.extends].flat().filter((e) => typeof e === 'string');
  let chain = empty;
  for (const parent of parents as string[]) {
    const withExt = parent.endsWith('.json') ? parent : `${parent}.json`;
    const base = parent.startsWith('.')
      ? posix.resolve(dir, withExt)
      : posix.join(root, 'node_modules', withExt);
    chain = readTsconfigChain(base, root, seen);
  }
  const options = json.compilerOptions ?? {};
  if (options.baseUrl !== undefined)
    chain = { ...chain, baseUrl: posix.resolve(dir, options.baseUrl) };
  if (options.paths !== undefined) chain = { ...chain, paths: options.paths, pathsDir: dir };
  return chain;
}

function scopeFor(file: string, root: string): AliasScope {
  const { paths = {}, pathsDir, baseUrl } = readTsconfigChain(file, root);
  const base = baseUrl ?? pathsDir;
  const rules: AliasRule[] = Object.entries(paths).map(([pattern, targets]) => ({
    pattern,
    targets: targets.map((t) => posix.resolve(base, t)),
  }));
  return { dir: posix.dirname(file), rules };
}

function readConfig(root: string): MoveConfig {
  const file = posix.join(root, 'move-files.config.json');
  if (!existsSync(file)) return { companions: [], extraMockCallees: [] };
  const json = JSON.parse(readFileSync(file, 'utf8'));
  return { companions: json.companions ?? [], extraMockCallees: json.extraMockCallees ?? [] };
}

export function loadMoveContext(root: string, paths: readonly string[]): MoveContext {
  const aliasScopes = paths
    .filter((p) => posix.basename(p) === 'tsconfig.json')
    .map((p) => scopeFor(p, root));
  return { root, config: readConfig(root), aliasScopes };
}
