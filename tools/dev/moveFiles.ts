#!/usr/bin/env node
/**
 * moveFiles — move or rename TypeScript files and let ts-morph rewrite every
 * import across the repo, so a folder reorg is one command instead of a
 * grep-and-hand-edit slog.
 *
 * ## Why ts-morph rather than an agent editing imports
 *
 * Every import in skymap is deep + relative with no barrels (CLAUDE.md). When
 * a file moves, each `../../utils/foo` that resolves to it has to change, and
 * the correct number of `../` depends on where the *importer* lives — the kind
 * of mechanical re-derivation an AST tool does perfectly and a human (or an
 * agent hand-editing) gets subtly wrong. `SourceFile.move()` re-parses the
 * module graph and rewrites references in both directions. The one `Project`
 * spanning all three source trees comes from `loadRefactorProject` — see its
 * header for why neither tsconfig's own include set is sufficient.
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

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFlags } from '../utils/cli/args';
import type { MovePair } from '../utils/refactor/applyMoves';
import { applyMoves } from '../utils/refactor/applyMoves';
import { expandTestMirrors } from '../utils/refactor/expandTestMirrors';
import { loadRefactorProject } from '../utils/refactor/loadRefactorProject';

// Parse argv into the raw move pairs the user asked for (before test-mirror
// expansion). Either a manifest JSON array or a single positional <from> <to>.
function parseMoves(argv: readonly string[]): MovePair[] {
  const manifestIdx = argv.indexOf('--manifest');
  if (manifestIdx !== -1) {
    const manifestPath = argv[manifestIdx + 1];
    if (!manifestPath) throw new Error('--manifest requires a path argument.');
    const parsed = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
    if (!Array.isArray(parsed))
      throw new Error(`${manifestPath} must be a JSON array of {from,to}.`);
    return parsed.map((m: MovePair) => ({ from: m.from, to: m.to }));
  }
  const positional = argv.filter((a) => !a.startsWith('--'));
  if (positional.length !== 2) {
    throw new Error('Usage: move-files <from> <to>  |  move-files --manifest <path.json>  [--dry]');
  }
  return [{ from: positional[0]!, to: positional[1]! }];
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const { '--dry': dry } = parseFlags(argv, { '--dry': 'bool' });

  const requested = parseMoves(argv);
  // Expand against the real filesystem so a source move drags its test mirror.
  const moves = expandTestMirrors(requested, (p) => existsSync(resolve(p)));

  const project = loadRefactorProject();

  applyMoves(
    project,
    moves.map(({ from, to }) => ({ from: resolve(from), to: resolve(to) })),
  );

  // After the in-memory moves, every file ts-morph rewrote (the moved files
  // plus their importers) is now unsaved — that dirty set is the blast radius.
  const rewritten = project.getSourceFiles().filter((f) => !f.isSaved());

  process.stdout.write(`move-files: ${moves.length} move(s):\n`);
  for (const { from, to } of moves) process.stdout.write(`  ${from}  ->  ${to}\n`);
  process.stdout.write(`\nmove-files: ${rewritten.length} file(s) with updated imports:\n`);
  for (const f of rewritten) process.stdout.write(`  ${f.getFilePath()}\n`);

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
