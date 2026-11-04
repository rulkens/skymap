/**
 * planMoves: validate a batch, drag its companions, and return the whole plan
 * (edits and guard findings) or every reason it was refused.
 *
 * Nothing is half-valid: all refusals are collected so one run shows every
 * problem. A destination another move in the batch vacates is free, so chains
 * and swaps pass. Requests are root-relative and stay so in `plan.moves`;
 * the core works in absolute paths. A source counts as present if it has text
 * or merely exists (an asset), because assets are renamed on disk without an edit.
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

  const inside: MovePair[] = [];
  for (const pair of request) {
    const outside = [pair.from, pair.to].filter((p) => rel(abs(p)).startsWith('..'));
    for (const path of outside) refuse('outside-repo', path, 'is outside the repository');
    if (outside.length === 0 && abs(pair.from) !== abs(pair.to))
      inside.push({ from: rel(abs(pair.from)), to: rel(abs(pair.to)) });
  }

  const existsRel = (path: string) => exists(abs(path));
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
  const taken = new Map<string, string>(); // lower-cased path -> path, for what stays on disk
  for (const path of snapshot.texts.keys())
    if (!absSources.has(path)) taken.set(path.toLowerCase(), path);
  for (const { from, to } of moves) {
    if (!exists(abs(from))) refuse('missing-source', from, 'does not exist');
    const dest = abs(to);
    const clash = taken.get(dest.toLowerCase());
    if (!absSources.has(dest) && exists(dest)) refuse('occupied-destination', to, 'already exists');
    else if (clash !== undefined && clash !== dest)
      refuse('case-collision', to, `differs only by case from ${rel(clash)}`);
  }
  if (refusals.length > 0) return { ok: false, refusals };

  const absMoves = new Map(moves.map(({ from, to }) => [abs(from), abs(to)]));
  const edits = rewriteReferences(snapshot, absMoves, context);
  const findings = findBrokenReferences(snapshot, edits, absMoves, root);
  return { ok: true, plan: { moves, edits, findings } };
}
