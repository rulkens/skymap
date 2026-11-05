/**
 * resolveReference: which file a module specifier names, in TS bundler order.
 *
 * Order, one pass as TS does it: a written extension's stand-ins (`.js` for `.ts`,
 * `.mjs` for `.mts`), the implicit extensions, then a folder's `index`. `.`, `..`
 * and a trailing `/` name a directory only. Past TS: the path as written (an
 * asset) and a bare `.json`, as Node and bundlers read it. Non-relative specifiers
 * resolve only through the nearest config's aliases, so a package name is `null`.
 * The `shape` it returns is what `spellReference` keeps when the target moves.
 */

import { posix } from 'node:path';
import type { AliasRule } from './@types/AliasRule';
import type { AliasScope } from './@types/AliasScope';
import type { ResolvedReference } from './@types/ResolvedReference';
import { isRelativeSpecifier } from './isRelativeSpecifier';

const IMPLICIT = ['.ts', '.tsx', '.d.ts', '.js', '.jsx'];
const TSX_FIRST = ['.tsx', '.ts', '.d.ts', '.jsx', '.js'];
const ES_MODULE = ['.mts', '.d.mts', '.mjs'];
const COMMONJS = ['.cts', '.d.cts', '.cjs'];
const STANDS_FOR: Record<string, readonly string[]> = {
  '.ts': IMPLICIT,
  '.d.ts': IMPLICIT,
  '.js': IMPLICIT,
  '.tsx': TSX_FIRST,
  '.jsx': TSX_FIRST,
  '.mts': ES_MODULE,
  '.d.mts': ES_MODULE,
  '.mjs': ES_MODULE,
  '.cts': COMMONJS,
  '.d.cts': COMMONJS,
  '.cjs': COMMONJS,
};
const WRITTEN_EXTENSION = /(?:\.d)?\.[cm]?ts$|\.[cm]?js$|\.[jt]sx$/;
const DIRECTORY_ONLY = /(?:^|\/)\.{0,2}$/;

function probe(
  abs: string,
  directoryOnly: boolean,
  hasFile: (path: string) => boolean,
): Pick<ResolvedReference, 'target' | 'shape'> | null {
  if (!directoryOnly) {
    const written = WRITTEN_EXTENSION.exec(abs)?.[0];
    if (written) {
      const stem = abs.slice(0, -written.length);
      for (const ext of STANDS_FOR[written]!) {
        const target = stem + ext;
        if (hasFile(target)) return { target, shape: target === abs ? 'exact' : 'js' };
      }
    }
    for (const ext of IMPLICIT) if (hasFile(abs + ext)) return { target: abs + ext, shape: 'bare' };
  }
  for (const ext of IMPLICIT) {
    if (hasFile(`${abs}/index${ext}`)) return { target: `${abs}/index${ext}`, shape: 'dir' };
  }
  if (directoryOnly) return null;
  if (hasFile(abs)) return { target: abs, shape: 'exact' };
  return hasFile(`${abs}.json`) ? { target: `${abs}.json`, shape: 'bare' } : null;
}

function nearestScope(importer: string, scopes: readonly AliasScope[]): AliasScope | null {
  let best: AliasScope | null = null;
  for (const scope of scopes) {
    const prefix = scope.dir.endsWith('/') ? scope.dir : `${scope.dir}/`;
    if (importer.startsWith(prefix) && (best === null || scope.dir.length > best.dir.length))
      best = scope;
  }
  return best;
}

// Longest literal prefix first, as TS does; an exact (star-less) pattern beats any wildcard.
const specificity = (rule: AliasRule) => {
  const star = rule.pattern.indexOf('*');
  return star < 0 ? Infinity : star;
};

function aliasPaths(specifier: string, rule: AliasRule): string[] {
  const star = rule.pattern.indexOf('*');
  if (star < 0) return specifier === rule.pattern ? [...rule.targets] : [];
  const pre = rule.pattern.slice(0, star);
  const post = rule.pattern.slice(star + 1);
  if (specifier.length < pre.length + post.length) return [];
  if (!specifier.startsWith(pre) || !specifier.endsWith(post)) return [];
  const mid = specifier.slice(pre.length, specifier.length - post.length);
  return rule.targets.map((target) => target.replace('*', () => mid));
}

export function resolveReference(
  specifier: string,
  importer: string,
  hasFile: (path: string) => boolean,
  scopes: readonly AliasScope[],
): ResolvedReference | null {
  const q = specifier.indexOf('?');
  const bare = q < 0 ? specifier : specifier.slice(0, q);
  const query = q < 0 ? '' : specifier.slice(q);
  const directoryOnly = DIRECTORY_ONLY.test(bare);
  if (isRelativeSpecifier(bare)) {
    const hit = probe(posix.resolve(posix.dirname(importer), bare), directoryOnly, hasFile);
    return hit && { ...hit, query, alias: null };
  }
  const scope = nearestScope(importer, scopes);
  if (!scope) return null;
  const rules = [...scope.rules].sort((a, b) => specificity(b) - specificity(a));
  for (const rule of rules) {
    const paths = aliasPaths(bare, rule);
    if (paths.length === 0) continue;
    for (const path of paths) {
      const hit = probe(posix.resolve(path), directoryOnly, hasFile);
      if (hit) return { ...hit, query, alias: rule };
    }
    return null; // TS stops at the best matching pattern, even when none of its targets exist
  }
  return null;
}
