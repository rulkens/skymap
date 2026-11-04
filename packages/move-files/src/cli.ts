#!/usr/bin/env node
/**
 * move-files: move files and rewrite every reference to them in one pass.
 *
 *   move-files <from> <to> | --manifest <file.json> [--dry]
 *
 * Exit 0 clean, 1 written (or `--dry`) with findings, 2 refused or bad
 * arguments with nothing written, 3 a write failed partway.
 */

import { posix } from 'node:path';
import { parseArgs } from 'node:util';
import type { MovePair } from './@types/MovePair';
import { applyPlan } from './applyPlan';
import { listProjectFiles } from './listProjectFiles';
import { loadMoveContext } from './loadMoveContext';
import { planMoves } from './planMoves';
import { readMoveManifest } from './readMoveManifest';
import { readSnapshot } from './readSnapshot';
import { renderMoveReport } from './renderMoveReport';

const USAGE = 'Usage: move-files <from> <to>  |  move-files --manifest <file.json>  [--dry]';

function requestedMoves() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { manifest: { type: 'string' }, dry: { type: 'boolean', default: false } },
  });
  const dry = values.dry ?? false;
  if (values.manifest !== undefined && positionals.length === 0)
    return { moves: readMoveManifest(values.manifest), dry };
  if (values.manifest === undefined && positionals.length === 2)
    return { moves: [{ from: positionals[0]!, to: positionals[1]! } satisfies MovePair], dry };
  throw new Error(USAGE);
}

function main(root: string): number {
  const err = (line: string) => process.stderr.write(`move-files: ${line}\n`);
  let result;
  let dry: boolean;
  try {
    const request = requestedMoves();
    dry = request.dry;
    const paths = listProjectFiles(root);
    result = planMoves(request.moves, readSnapshot(paths), loadMoveContext(root, paths));
  } catch (error) {
    err(error instanceof Error ? error.message : String(error));
    return 2;
  }
  if (!result.ok) {
    for (const r of result.refusals) err(`${r.code}: ${r.path} ${r.detail}`);
    return 2;
  }

  const { plan } = result;
  process.stdout.write(renderMoveReport(plan, root));
  if (dry) {
    process.stdout.write('\nmove-files: --dry, nothing saved.\n');
  } else {
    const { failed, completed } = applyPlan(plan, root);
    if (failed !== null) {
      err(`writing ${posix.relative(root, failed)} failed.`);
      err(`${completed.length} file(s) were finished:`);
      for (const path of completed) err(`  ${posix.relative(root, path)}`);
      err('A moved file not finished sits beside its destination as <name>.move-files-tmp.');
      return 3;
    }
    process.stdout.write('\nmove-files: saved.\n');
  }
  return plan.findings.length > 0 ? 1 : 0;
}

process.exitCode = main(process.cwd());
