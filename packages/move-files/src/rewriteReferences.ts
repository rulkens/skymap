/**
 * rewriteReferences: the edits that keep every reference valid after a batch.
 *
 * Every reference is resolved against the OLD layout and spelled for the NEW one,
 * never against a half-moved state, so chains and swaps need no ordering. Moved
 * files always come back (even unedited, since they change path); other files only
 * when a spelling changed. A moved file's specifier that resolves to no module
 * (an asset, a `.wesl`) is kept valid by path math. `.astro`/`.mdx` are not
 * rewritten; the guard reports what they now miss. Offsets are UTF-16, so BOM and
 * non-ASCII text survive.
 */

import { posix } from 'node:path';
import type { FileEdit } from './@types/FileEdit';
import type { MoveContext } from './@types/MoveContext';
import type { PathReference } from './@types/PathReference';
import type { ProjectSnapshot } from './@types/ProjectSnapshot';
import { findCssReferences } from './findCssReferences';
import { findTsReferences } from './findTsReferences';
import { isRelativeSpecifier } from './isRelativeSpecifier';
import { isScriptFile } from './isScriptFile';
import { isStylesheet } from './isStylesheet';
import { layoutExists } from './layoutExists';
import { mentionsMovedFile } from './mentionsMovedFile';
import { relativeSpecifier } from './relativeSpecifier';
import { resolveReference } from './resolveReference';
import { spellReference } from './spellReference';

export function rewriteReferences(
  snapshot: Pick<ProjectSnapshot, 'texts' | 'fileExists'>,
  moves: ReadonlyMap<string, string>,
  context: MoveContext,
): FileEdit[] {
  const hasBefore = layoutExists(snapshot, new Map());
  const hasAfter = layoutExists(snapshot, moves);
  const scopes = context.aliasScopes;
  const mayReference = mentionsMovedFile(moves.keys(), scopes);
  const edits: FileEdit[] = [];

  for (const [path, text] of snapshot.texts) {
    const newPath = moves.get(path);
    const moved = newPath !== undefined;
    const isTs = isScriptFile(path);
    const isCss = isStylesheet(path);
    if (!moved && !((isTs || isCss) && mayReference(text))) continue;
    const oldDir = posix.dirname(path);
    const newDir = posix.dirname(newPath ?? path);
    const replacements: { reference: PathReference; value: string }[] = [];

    if (isTs) {
      for (const reference of findTsReferences(path, text, context.config.extraMockCallees)) {
        const hit = resolveReference(reference.value, path, hasBefore, scopes);
        let value: string | null = null;
        if (hit) {
          const target = moves.get(hit.target) ?? hit.target;
          if (moved || target !== hit.target) {
            value = spellReference(hit, reference.value, newPath ?? path, target, hasAfter, scopes);
          }
        } else if (moved && isRelativeSpecifier(reference.value)) {
          value = pathMath(oldDir, newDir, reference.value);
        }
        if (value !== null && value !== reference.value) replacements.push({ reference, value });
      }
    } else if (isCss) {
      for (const reference of findCssReferences(text)) {
        const [file, suffix] = splitSuffix(reference.value);
        const abs = posix.resolve(oldDir, file);
        let value: string | null = null;
        if (hasBefore(abs)) {
          const target = moves.get(abs) ?? abs;
          if (moved || target !== abs) value = relativeSpecifier(newDir, target) + suffix;
        } else if (moved && file.startsWith('.')) {
          value = pathMath(oldDir, newDir, reference.value);
        }
        if (value === `./${reference.value}`) value = null;
        if (value !== null && value !== reference.value) {
          // An unquoted url() cannot hold a space or a bracket.
          const quoted = /['"]/.test(text[reference.start - 1]!) || !/[\s()]/.test(value);
          replacements.push({ reference, value: quoted ? value : `"${value}"` });
        }
      }
    }

    if (replacements.length === 0 && !moved) continue;
    let out = text;
    for (const { reference, value } of replacements.sort(
      (a, b) => b.reference.start - a.reference.start,
    )) {
      out = out.slice(0, reference.start) + value + out.slice(reference.end);
    }
    edits.push({ from: path, to: newPath ?? path, text: out });
  }
  return edits;
}

function splitSuffix(value: string): [string, string] {
  const cut = value.search(/[?#]/);
  return cut < 0 ? [value, ''] : [value.slice(0, cut), value.slice(cut)];
}

// A path that is not a module keeps pointing at the same file from the new directory.
function pathMath(oldDir: string, newDir: string, value: string): string {
  const [file, suffix] = splitSuffix(value);
  return relativeSpecifier(newDir, posix.resolve(oldDir, file)) + suffix;
}
