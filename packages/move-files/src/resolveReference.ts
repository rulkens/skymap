/**
 * resolveReference: which file a module specifier names, in TS bundler order.
 *
 * Order: exact, `.ts`/`.tsx`/`.d.ts`, `.js`/`.jsx` standing for TS, then a
 * folder's `index`. Non-relative specifiers resolve only through the nearest
 * tsconfig scope's aliases, so a bare package name is `null`. The `shape` it
 * returns is what `spellReference` keeps when the target moves.
 */

import { posix } from 'node:path';
import type { AliasRule } from './@types/AliasRule';
import type { AliasScope } from './@types/AliasScope';
import type { ReferenceShape } from './@types/ReferenceShape';
import type { ResolvedReference } from './@types/ResolvedReference';

const TS_EXTENSIONS = ['.ts', '.tsx', '.d.ts'];

function probe(
  abs: string,
  hasFile: (path: string) => boolean,
): { target: string; shape: ReferenceShape } | null {
  if (hasFile(abs)) return { target: abs, shape: 'exact' };
  for (const ext of TS_EXTENSIONS)
    if (hasFile(abs + ext)) return { target: abs + ext, shape: 'bare' };
  const js = /\.(jsx?)$/.exec(abs);
  if (js) {
    const stem = abs.slice(0, -js[0].length);
    for (const ext of js[1] === 'js' ? TS_EXTENSIONS : ['.tsx']) {
      if (hasFile(stem + ext)) return { target: stem + ext, shape: 'js' };
    }
  }
  for (const ext of TS_EXTENSIONS) {
    if (hasFile(`${abs}/index${ext}`)) return { target: `${abs}/index${ext}`, shape: 'dir' };
  }
  return null;
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
  return rule.targets.map((target) => target.replace('*', mid));
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
  if (bare.startsWith('.')) {
    const hit = probe(posix.resolve(posix.dirname(importer), bare), hasFile);
    return hit && { ...hit, query, alias: null };
  }
  const scope = nearestScope(importer, scopes);
  if (!scope) return null;
  const rules = [...scope.rules].sort((a, b) => specificity(b) - specificity(a));
  for (const rule of rules) {
    for (const path of aliasPaths(bare, rule)) {
      const hit = probe(path, hasFile);
      if (hit) return { ...hit, query, alias: rule };
    }
  }
  return null;
}
