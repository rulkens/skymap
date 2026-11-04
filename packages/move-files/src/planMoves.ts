/**
 * planMoves: validate a batch, drag its companions, and return the whole plan
 * (edits and guard findings) or every reason it was refused.
 *
 * Nothing is half-valid: all refusals are collected so one run shows every
 * problem. A destination another move in the batch vacates is free, so chains
 * and swaps pass. Requests are root-relative and stay so in `plan.moves`; the
 * core works in absolute paths. Sources must be listed in their exact case, since
 * on macOS the disk also answers for `foo.ts` when `Foo.ts` is what git holds.
 */

import { posix } from 'node:path';
import type { MovePair } from './@types/MovePair';
import type { MoveContext } from './@types/MoveContext';
import type { PlanResult } from './@types/PlanResult';
import type { ProjectSnapshot } from './@types/ProjectSnapshot';
import type { Refusal } from './@types/Refusal';
import { expandCompanions } from './expandCompanions';
import { findBrokenReferences } from './findBrokenReferences';
import { findUnplaceableCompanions } from './findUnplaceableCompanions';
import { rewriteReferences } from './rewriteReferences';

// No specifier can hold these as written: they end or change the string around them.
const UNSPELLABLE = /['"`\\\n]/;

function ancestorsOf(rel: string): string[] {
  const ancestors: string[] = [];
  for (let dir = posix.dirname(rel); dir !== '.'; dir = posix.dirname(dir)) ancestors.push(dir);
  return ancestors;
}

export function planMoves(
  request: readonly MovePair[],
  snapshot: ProjectSnapshot,
  context: MoveContext,
): PlanResult {
  const { root } = context;
  const refusals: Refusal[] = [];
  const refuse = (code: Refusal['code'], path: string, detail: string) =>
    refusals.push({ code, path, detail });
  const abs = (rel: string) => posix.resolve(root, rel);
  const rel = (path: string) => posix.relative(root, path);
  const exists = (path: string) => snapshot.texts.has(path) || snapshot.fileExists(path);
  const isSource = (path: string) => snapshot.listed.has(path) && exists(path);

  const inside: MovePair[] = [];
  for (const pair of request) {
    const outside = [pair.from, pair.to].filter((p) => {
      const path = rel(abs(p));
      return path === '..' || path.startsWith('../');
    });
    for (const path of outside) refuse('outside-repo', path, 'is outside the repository');
    if (pair.to.endsWith('/')) refuse('invalid-destination', pair.to, 'names a folder, not a file');
    else if (outside.length === 0 && abs(pair.from) !== abs(pair.to))
      inside.push({ from: rel(abs(pair.from)), to: rel(abs(pair.to)) });
  }

  const existsRel = (path: string) => isSource(abs(path));
  for (const path of findUnplaceableCompanions(inside, context.config.companions, existsRel))
    refuse('companion-unplaceable', path, 'has no rule for the destination; add a pair for it');
  const moves = expandCompanions(inside, context.config.companions, existsRel);

  const sources = new Set<string>();
  const destinations = new Set<string>();
  for (const { from, to } of moves) {
    if (sources.has(from)) refuse('duplicate-source', from, 'is moved more than once');
    if (destinations.has(to)) refuse('duplicate-destination', to, 'is the target of two moves');
    sources.add(from);
    destinations.add(to);
  }

  const absSources = new Set([...sources].map(abs));
  const vacated = new Set([...absSources].map((path) => path.toLowerCase()));
  const taken = new Map<string, string>(); // lower-cased path -> path, for what ends up on disk
  for (const path of snapshot.listed) {
    if (!absSources.has(path)) taken.set(path.toLowerCase(), path);
  }
  // On macOS a folder in another case is the same folder: the file would land in it, the
  // specifiers would keep the new case, and only a case-sensitive machine would notice.
  const folders = new Set<string>();
  const foldedFolders = new Map<string, string>();
  const addFolders = (path: string) => {
    for (const dir of ancestorsOf(path)) {
      folders.add(dir);
      if (!foldedFolders.has(dir.toLowerCase())) foldedFolders.set(dir.toLowerCase(), dir);
    }
  };
  for (const path of snapshot.listed) addFolders(rel(path));
  for (const { from, to } of moves) {
    if (!isSource(abs(from))) refuse('missing-source', from, 'is not a file git lists; check case');
    const dest = abs(to);
    const lower = dest.toLowerCase();
    const clash = taken.get(lower);
    const fileAbove = ancestorsOf(to).find((dir) => destinations.has(dir) || exists(abs(dir)));
    const miscased = ancestorsOf(to).find(
      (dir) => !folders.has(dir) && foldedFolders.has(dir.toLowerCase()),
    );
    // On macOS a path differing by case from a vacated source "exists" only as that source.
    const free = absSources.has(dest) || (vacated.has(lower) && !snapshot.listed.has(dest));
    if (UNSPELLABLE.test(to)) refuse('invalid-destination', to, 'has a quote or backslash');
    else if (snapshot.directoryExists(dest)) refuse('invalid-destination', to, 'is a directory');
    else if (fileAbove) refuse('invalid-destination', to, `sits under the file ${fileAbove}`);
    else if (miscased) {
      const existing = foldedFolders.get(miscased.toLowerCase())!;
      refuse('case-collision', to, `folder ${miscased} differs only by case from ${existing}`);
    } else if (!free && exists(dest)) refuse('occupied-destination', to, 'already exists');
    else if (clash !== undefined && clash !== dest)
      refuse('case-collision', to, `differs only by case from ${rel(clash)}`);
    taken.set(lower, dest);
    addFolders(to);
  }
  if (refusals.length > 0) return { ok: false, refusals };

  const absMoves = new Map(moves.map(({ from, to }) => [abs(from), abs(to)]));
  const edits = rewriteReferences(
    snapshot,
    absMoves,
    context.aliasScopes,
    context.config.extraMockCallees,
  );
  const findings = findBrokenReferences(snapshot, edits, absMoves, root, context.aliasScopes);
  return { ok: true, plan: { moves, edits, findings } };
}
