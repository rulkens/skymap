/**
 * findBrokenReferences: what a batch newly broke, beyond the imports it rewrote.
 *
 * Reports only changes: a string that resolved before and no longer does, or now lands
 * on a different file than the moved target (compared by identity, so a reoccupied
 * path counts); and an old repo-relative path still in code. Text scans find suspects
 * cheaply; only a file with a suspect gets parsed, to rule out comments, because
 * parsing every file would cost seconds. Strings pair by position between old and new
 * text, since a rewrite changes values but never how many strings a file has.
 */

import { posix } from 'node:path';
import type { FileEdit } from './@types/FileEdit';
import type { GuardFinding } from './@types/GuardFinding';
import type { GuardSuspect } from './@types/GuardSuspect';
import type { MoveContext } from './@types/MoveContext';
import type { ProjectSnapshot } from './@types/ProjectSnapshot';
import type { ReferenceHit } from './@types/ReferenceHit';
import { escapeRegExp } from './escapeRegExp';
import { findLiteralRanges } from './findLiteralRanges';
import { isScriptFile } from './isScriptFile';
import { isStylesheet } from './isStylesheet';
import { layoutExists } from './layoutExists';
import { resolveReference } from './resolveReference';
import { stripExtension } from './stripExtension';

// Every string on a line, and an unquoted url(), which is one too.
const STRING = /'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`|\burl\(\s*([^'")\s]+)\s*\)/g;
const SPELLS_RELATIVE = /^\.\.?\//; // `'.'` and `'..'` are more often text than a path
const CSS_SYNTAX = /\.(?:css|scss|less|pcss)$/;
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const withoutFragment = (value: string) => value.split('#')[0]!;

function confirmed(path: string, text: string, suspects: GuardSuspect[]): GuardSuspect[] {
  if (suspects.length === 0) return suspects;
  if (CSS_SYNTAX.test(path)) {
    const comments = [...text.matchAll(CSS_COMMENT)];
    return suspects.filter(
      (s) => !comments.some((c) => s.index >= c.index && s.index < c.index + c[0].length),
    );
  }
  if (!isScriptFile(path)) return suspects;
  const ranges = findLiteralRanges(path, text);
  return suspects.filter((s) => ranges.some(([start, end]) => s.index >= start && s.index < end));
}

function findStrings(text: string): ReferenceHit[] {
  return [...text.matchAll(STRING)].map((m) => {
    const value = m[1] ?? m[2] ?? m[3] ?? m[4]!;
    return { index: m.index + (m[4] === undefined ? 1 : m[0].indexOf(value)), value };
  });
}

function oldPathPattern(moves: ReadonlyMap<string, string>, root: string): RegExp | null {
  const alternatives = [...moves.keys()].map((from) => {
    const rel = posix.relative(root, from);
    const stem = stripExtension(rel);
    const ext = rel.slice(stem.length);
    const alsoWritten = ext === '.ts' ? '|\\.js' : ext === '.tsx' ? '|\\.jsx|\\.js' : '';
    const extensions = `(?:${escapeRegExp(ext)}${alsoWritten})`;
    // A root-level name is a path only with its extension and no folder; else it's just a word.
    return rel.includes('/')
      ? `${escapeRegExp(stem)}${extensions}?`
      : `(?<!/)${escapeRegExp(stem)}${extensions}`;
  });
  if (alternatives.length === 0) return null;
  return new RegExp(`(?<![\\w.-])(?<!\\.\\/)(?:${alternatives.join('|')})(?![\\w-]|\\.\\w)`, 'g');
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;
const lineText = (text: string, line: number) => text.split('\n')[line - 1]!.trim();

export function findBrokenReferences(
  before: Pick<ProjectSnapshot, 'texts' | 'fileExists'>,
  edits: readonly FileEdit[],
  moves: ReadonlyMap<string, string>,
  context: MoveContext,
): GuardFinding[] {
  const scopes = context.aliasScopes;
  const after = new Map(before.texts);
  for (const from of moves.keys()) after.delete(from);
  for (const edit of edits) after.set(edit.to, edit.text);
  const inverse = new Map([...moves].map(([from, to]) => [to, from]));
  const destinations = new Set(moves.values());
  const hasBefore = layoutExists(before, new Map());
  const hasAfter = layoutExists(before, moves);
  const oldPaths = oldPathPattern(moves, context.root);
  const findings: GuardFinding[] = [];
  const report = (file: string, text: string, index: number, reason: GuardFinding['reason']) => {
    const line = lineOf(text, index);
    if (findings.some((f) => f.file === file && f.line === line && f.reason === reason)) return;
    findings.push({ file, line, text: lineText(text, line), reason });
  };

  for (const [path, text] of after) {
    const suspects: GuardSuspect[] = [];
    const oldPath = inverse.get(path) ?? path;
    const oldText = before.texts.get(oldPath);
    // Nothing rewrites `.astro`, `.mdx`, `.vue`, `.svelte` or Sass, so their aliases are judged here too.
    const rewritten = isScriptFile(path) || isStylesheet(path);
    if (oldText !== undefined && (!rewritten || oldText.includes('./'))) {
      const oldStrings = findStrings(oldText);
      const newStrings = oldText === text ? oldStrings : findStrings(text);
      oldStrings.forEach((old, i) => {
        if (!SPELLS_RELATIVE.test(old.value) && (rewritten || old.value.startsWith('.'))) return;
        const was = resolveReference(withoutFragment(old.value), oldPath, hasBefore, scopes);
        if (!was) return;
        const current = newStrings[i]!;
        const now = resolveReference(withoutFragment(current.value), path, hasAfter, scopes);
        if (!now) suspects.push({ index: current.index, reason: 'no-longer-resolves' });
        else if (now.target !== (moves.get(was.target) ?? was.target))
          suspects.push({ index: current.index, reason: 'now-resolves-elsewhere' });
      });
    }
    if (oldPaths) {
      for (const m of text.matchAll(oldPaths)) {
        const enclosing = findStrings(text).find(
          (s) => m.index >= s.index && m.index < s.index + s.value.length,
        );
        const means =
          enclosing && resolveReference(withoutFragment(enclosing.value), path, hasAfter, scopes);
        // A new path can end in the old one; a string that reaches a moved file is correct.
        if (!means || !destinations.has(means.target))
          suspects.push({ index: m.index, reason: 'mentions-old-path' });
      }
    }
    for (const { index, reason } of confirmed(path, text, suspects))
      report(path, text, index, reason);
  }
  return findings;
}
