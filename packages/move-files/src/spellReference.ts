/**
 * spellReference: write a reference to `newTarget` the way the author wrote it.
 *
 * Candidates run author's form, then the explicit path (`./foo/index`), then
 * relative; the first that resolves back to `newTarget` in the new layout wins,
 * so keeping `./foo` can never start hitting a new `foo.ts`. An alias is kept
 * only while the target stays inside it.
 */

import { posix } from 'node:path';
import type { AliasRule } from './@types/AliasRule';
import type { AliasScope } from './@types/AliasScope';
import type { ResolvedReference } from './@types/ResolvedReference';
import { relativeSpecifier } from './relativeSpecifier';
import { resolveReference } from './resolveReference';
import { stripExtension } from './stripExtension';

function spellAlias(rule: AliasRule, path: string): string | null {
  for (const target of rule.targets) {
    const star = target.indexOf('*');
    if (star < 0) {
      if (path === target || path === stripExtension(target)) return rule.pattern;
      continue;
    }
    const pre = target.slice(0, star);
    const post = target.slice(star + 1);
    if (path.startsWith(pre) && path.endsWith(post)) {
      return rule.pattern.replace('*', () => path.slice(pre.length, path.length - post.length));
    }
  }
  return null;
}

export function spellReference(
  reference: ResolvedReference,
  specifier: string,
  newImporter: string,
  newTarget: string,
  hasFile: (path: string) => boolean,
  scopes: readonly AliasScope[],
): string {
  const bare = specifier.split('?')[0]!;
  const base = stripExtension(newTarget);
  const author = {
    exact: posix.extname(bare) ? newTarget : base, // `#core` names `engine.ts` but spells no extension
    bare: base,
    js: base + posix.extname(bare),
    dir: posix.dirname(newTarget),
  }[reference.shape];
  const dir = posix.dirname(newImporter);
  const trailing = reference.shape === 'dir' && bare.endsWith('/') ? '/' : '';
  const aliased = (path: string) => (reference.alias ? spellAlias(reference.alias, path) : null);
  const explicit = relativeSpecifier(dir, newTarget);
  const candidates = [
    aliased(author),
    aliased(base),
    aliased(newTarget),
    relativeSpecifier(dir, author) + trailing,
    relativeSpecifier(dir, base),
    explicit,
  ].filter((c): c is string => c !== null);
  const spelled = candidates.find(
    (c) => resolveReference(c, newImporter, hasFile, scopes)?.target === newTarget,
  );
  return (spelled ?? explicit) + reference.query;
}
