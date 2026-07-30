#!/usr/bin/env node
/**
 * moveFiles — move or rename TypeScript files and let ts-morph rewrite every
 * import across the repo, so a folder reorg is one command instead of a
 * grep-and-hand-edit slog.
 *
 * This is now a thin alias: the orchestration (expand test mirrors, apply the
 * batch inside the shared `Project`) lives in `planMove`, which the `refactor
 * move` subcommand also calls. See `planMove` for why ts-morph owns the import
 * rewriting and why the mirror-existence oracle is injected. This file keeps
 * only the `move-files` CLI contract and output format documented below.
 *
 * ## What this does NOT rewrite
 *
 * Only TypeScript import/export specifiers are AST-tracked. It does NOT touch:
 *   - `.wesl` shader imports (`import package::...`) — a separate module graph.
 *   - String-literal paths: `rawDataPath()` keys, shader/asset URLs, dynamic
 *     `import()` built from strings, anything referenced as text not as a
 *     module specifier.
 * After a move, `grep` for the old path/basename to catch those by hand.
 *
 * ## Commit hygiene
 *
 * Do the pure move in its own commit (no content edits mixed in) so git's
 * rename detection links old→new and history/`git blame` survive. Run
 * `--dry` first to preview the expanded move list and the set of files whose
 * imports would change.
 *
 * ## Usage
 *
 *   npm run move-files -- <from> <to>              # single file
 *   npm run move-files -- --manifest moves.json    # JSON array of {from,to}
 *   npm run move-files -- <from> <to> --dry        # preview, don't save
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFlags } from '../utils/cli/args';
import type { MovePair } from '../utils/refactor/applyMoves';
import { loadRefactorProject } from '../utils/refactor/loadRefactorProject';
import { parseMovePairEntry } from '../utils/refactor/parseMovePairEntry';
import { planMove } from '../utils/refactor/planMove';
import { readManifest } from '../utils/refactor/readManifest';
import { renderMoveReport } from '../utils/refactor/renderMoveReport';

// Parse argv into the raw move pairs the user asked for (before test-mirror
// expansion). Either a `--manifest` JSON array of `{from,to}` or a single
// positional `<from> <to>`.
function parseMoves(argv: readonly string[]): MovePair[] {
  const manifest = readManifest(argv);
  if (manifest !== null) return manifest.map(parseMovePairEntry);

  const positional = argv.filter((a) => !a.startsWith('--'));
  if (positional.length !== 2) {
    throw new Error('Usage: move-files <from> <to>  |  move-files --manifest <path.json>  [--dry]');
  }
  return [{ from: positional[0]!, to: positional[1]! }];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { '--dry': dry } = parseFlags(argv, { '--dry': 'bool' });

  const project = loadRefactorProject();
  // Expand against the real filesystem so a source move drags its test mirror.
  const moves = planMove(project, parseMoves(argv), (p) => existsSync(resolve(p)));

  // After the in-memory moves, every file ts-morph rewrote (the moved files
  // plus their importers) is now unsaved — that dirty set is the blast radius.
  const rewritten = project.getSourceFiles().filter((f) => !f.isSaved());
  process.stdout.write(renderMoveReport('move-files', moves, rewritten.map((f) => f.getFilePath())));

  if (dry) {
    process.stdout.write('\nmove-files: --dry, nothing saved.\n');
    return;
  }
  await project.save();
  process.stdout.write('\nmove-files: saved.\n');
}

main().catch((err) => {
  process.stderr.write(`move-files: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
