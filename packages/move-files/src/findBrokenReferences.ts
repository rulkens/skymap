/**
 * findBrokenReferences: what a batch newly broke, beyond the imports it rewrote.
 *
 * Reports only changes: a `./` string that resolved before and no longer does, or
 * now lands on a different file than the moved target (compared by identity, so a
 * reoccupied path counts); and an old repo-relative path still in code. Strings
 * that never resolved are ignored (this repo has 123 already). Text scans find
 * suspects cheaply; only a file with a suspect gets parsed, to rule out comments,
 * because parsing every file is what would cost seconds. Relative literals are
 * paired by position between old and new text, as a rewrite only changes values.
 */

import { posix } from 'node:path';
import type { FileEdit } from './@types/FileEdit';
import type { GuardFinding } from './@types/GuardFinding';
import type { GuardSuspect } from './@types/GuardSuspect';
import type { ProjectSnapshot } from './@types/ProjectSnapshot';
import type { ReferenceHit } from './@types/ReferenceHit';
import { findCssReferences } from './findCssReferences';
import { findLiteralRanges } from './findLiteralRanges';
import { layoutExists } from './layoutExists';
import { resolveReference } from './resolveReference';
import { stripExtension } from './stripExtension';

const RELATIVE_LITERAL = /(['"`])(\.\.?\/[^'"`\n$]*)\1/dg;
const TS_FILE = /\.[cm]?[jt]sx?$/;
const CSS_FILE = /\.(?:css|scss|less|pcss)$/;
const CSS_COMMENT = /\/\*[\s\S]*?\*\//g;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function confirmed(path: string, text: string, suspects: GuardSuspect[]): GuardSuspect[] {
  if (suspects.length === 0) return suspects;
  if (CSS_FILE.test(path)) {
    const comments = [...text.matchAll(CSS_COMMENT)];
    return suspects.filter(
      (s) => !comments.some((c) => s.index >= c.index && s.index < c.index + c[0].length),
    );
  }
  if (!TS_FILE.test(path)) return suspects;
  const ranges = findLiteralRanges(path, text);
  return suspects.filter((s) => ranges.some(([start, end]) => s.index >= start && s.index < end));
}

function relativeHits(path: string, text: string): ReferenceHit[] {
  if (CSS_FILE.test(path)) {
    return findCssReferences(text).map((r) => ({
      index: r.start,
      value: r.value.startsWith('.') ? r.value : `./${r.value}`,
    }));
  }
  return [...text.matchAll(RELATIVE_LITERAL)].map((m) => ({
    index: m.indices![2]![0],
    value: m[2]!,
  }));
}

function oldPathPattern(moves: ReadonlyMap<string, string>, root: string): RegExp | null {
  const alternatives = [...moves.keys()].map((from) => {
    const rel = posix.relative(root, from);
    const stem = stripExtension(rel);
    const ext = rel.slice(stem.length);
    const alsoWritten = ext === '.ts' ? '|\\.js' : ext === '.tsx' ? '|\\.jsx|\\.js' : '';
    return `${escape(stem)}(?:${escape(ext)}${alsoWritten})?`;
  });
  if (alternatives.length === 0) return null;
  return new RegExp(`(?<![\\w.-])(?<!\\.\\/)(?:${alternatives.join('|')})(?![\\w-]|\\.\\w)`, 'dg');
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;
const lineText = (text: string, line: number) => text.split('\n')[line - 1]!.trim();

export function findBrokenReferences(
  before: ProjectSnapshot,
  edits: readonly FileEdit[],
  moves: ReadonlyMap<string, string>,
  root: string,
): GuardFinding[] {
  const after = new Map(before.texts);
  for (const from of moves.keys()) after.delete(from);
  for (const edit of edits) after.set(edit.to, edit.text);
  const inverse = new Map([...moves].map(([from, to]) => [to, from]));
  const hasBefore = layoutExists(before, new Map());
  const hasAfter = layoutExists(before, moves);
  const oldPaths = oldPathPattern(moves, root);
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
    if (oldText !== undefined) {
      const oldHits = relativeHits(oldPath, oldText);
      const newHits = relativeHits(path, text);
      for (let i = 0; i < Math.min(oldHits.length, newHits.length); i++) {
        const was = resolveReference(oldHits[i]!.value.split('#')[0]!, oldPath, hasBefore, []);
        if (!was) continue;
        const expected = moves.get(was.target) ?? was.target;
        const now = resolveReference(newHits[i]!.value.split('#')[0]!, path, hasAfter, []);
        const { index } = newHits[i]!;
        if (!now) suspects.push({ index, reason: 'no-longer-resolves' });
        else if (now.target !== expected)
          suspects.push({ index, reason: 'now-resolves-elsewhere' });
      }
    }
    if (oldPaths) {
      for (const m of text.matchAll(oldPaths))
        suspects.push({ index: m.index, reason: 'mentions-old-path' });
    }
    for (const { index, reason } of confirmed(path, text, suspects))
      report(path, text, index, reason);
  }
  return findings;
}
