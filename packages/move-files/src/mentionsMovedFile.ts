/**
 * mentionsMovedFile: a cheap text test for "could this file reference a moved one?",
 * so rewrite parses only those: most of its time on a big repo, with the same output.
 *
 * A reference names a file by its stem, except: a moved `index` is named by its
 * folder or a dot-specifier (`from '../math'`, `'..'`, `'../..'`); a star-less alias
 * names only itself (`'#core'`); and an alias whose target adds to the file name
 * (`src/*.gen.ts`, `src/*\/main.ts`) drops part of the stem, so its prefix counts.
 */

import { posix } from 'node:path';
import type { AliasScope } from './@types/AliasScope';
import { escapeRegExp } from './escapeRegExp';
import { stripExtension } from './stripExtension';

const DOT_SPECIFIER = /(?:['"`]|\/)\.{1,2}\/?['"`]/;
const WHOLE_STEM_TARGET = /\/\*(?:\.\w+)?$/;
const CHARACTER_ESCAPE = /\\[ux]/; // `'./\x61'` names `a` without saying so

export function mentionsMovedFile(
  movedPaths: Iterable<string>,
  scopes: readonly AliasScope[],
): (text: string) => boolean {
  const stems = new Set<string>();
  let anyIndex = false;
  for (const path of movedPaths) {
    const stem = posix.basename(stripExtension(path));
    stems.add(stem);
    if (stem === 'index') {
      stems.add(posix.basename(posix.dirname(path)));
      anyIndex = true;
    }
  }
  if (stems.size === 0) return () => false;
  for (const { rules } of scopes) {
    for (const { pattern, targets } of rules) {
      const star = pattern.indexOf('*');
      if (star < 0) stems.add(pattern);
      else if (!targets.every((t) => WHOLE_STEM_TARGET.test(t))) stems.add(pattern.slice(0, star));
    }
  }
  const stemPattern = new RegExp([...stems].map(escapeRegExp).join('|'));
  return (text) =>
    stemPattern.test(text) || CHARACTER_ESCAPE.test(text) || (anyIndex && DOT_SPECIFIER.test(text));
}
