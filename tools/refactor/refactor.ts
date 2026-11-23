#!/usr/bin/env node
/**
 * refactor: one ts-morph CLI whose subcommands follow skymap's house conventions
 * (one symbol per file, filename = export name, deep relative imports, no barrels).
 * Moving files is `npm run move-files`, not a subcommand here.
 *
 * The driver owns the single save: every subcommand mutates the ONE in-memory
 * Project and throws on a validation failure before the save, so a batch
 * (`--manifest`) is all-or-nothing. `--dry` skips the save. Behaviour lives in
 * the unit-tested planners under `tools/utils/refactor/`.
 */

import { parseFlags } from '../utils/cli/args';
import { collectRefs } from '../utils/refactor/collectRefs';
import { loadRefactorProject } from '../utils/refactor/loadRefactorProject';
import { parseSymbolAddress } from '../utils/refactor/parseSymbolAddress';
import { planDelete } from '../utils/refactor/planDelete';
import { planExtract } from '../utils/refactor/planExtract';
import { planInline } from '../utils/refactor/planInline';
import { planRename } from '../utils/refactor/planRename';
import { readManifest } from '../utils/refactor/readManifest';
import { renderRefReport } from '../utils/refactor/renderRefReport';
import { resolveSymbol } from '../utils/refactor/resolveSymbol';
import type { LegacyInput } from './@types/LegacyInput';
import type { Subcommand } from './@types/Subcommand';

const FLAG_SCHEMA = { '--dry': 'bool', '--json': 'bool', '--no-file-rename': 'bool' } as const;

function needArg(name: string, what: string, value: string | undefined): string {
  if (value === undefined) throw new Error(`refactor ${name}: expected ${what}.`);
  return value;
}

// The driver has already checked the address and printed the preview; each row
// only applies its mutation.
const SUBCOMMANDS: readonly Subcommand[] = [
  {
    kind: 'legacy',
    name: 'rename',
    usage: 'refactor rename  <file>#<symbol> <newName>   [--no-file-rename]',
    run: ({ project, positionals, flags }) => {
      const newName = needArg(
        'rename',
        'a <file>#<symbol> address and a <newName>',
        positionals[1],
      );
      const resolved = resolveSymbol(project, parseSymbolAddress(positionals[0]!));
      planRename(project, resolved, newName, !flags['--no-file-rename']);
    },
  },
  {
    kind: 'legacy',
    name: 'extract',
    usage: 'refactor extract <file>#<symbol> <dest.ts>',
    run: ({ project, positionals }) => {
      const dest = needArg('extract', 'a <file>#<symbol> address and a <dest.ts>', positionals[1]);
      planExtract(project, resolveSymbol(project, parseSymbolAddress(positionals[0]!)), dest);
    },
  },
  {
    kind: 'legacy',
    name: 'inline',
    usage: 'refactor inline  <file>#<symbol>',
    run: ({ project, positionals }) =>
      planInline(project, resolveSymbol(project, parseSymbolAddress(positionals[0]!))),
  },
  {
    kind: 'legacy',
    name: 'delete',
    usage: 'refactor delete  <file>#<symbol>',
    run: ({ project, positionals }) =>
      planDelete(project, resolveSymbol(project, parseSymbolAddress(positionals[0]!))),
  },
  { kind: 'legacy', name: 'refs', usage: 'refactor refs    <file>#<symbol>', run: () => {} },
];

const USAGE = `Usage: refactor <subcommand> <args...> [--dry] [--json]

${SUBCOMMANDS.map((row) => `  ${row.usage}`).join('\n')}

Batch form (any subcommand): refactor <subcommand> --manifest <ops.json>`;

// The preview prints the references as they stand BEFORE the row mutates; for a
// refused delete it shows what blocks it. A malformed address fails here, before
// any mutation, so a batch aborts before the single save.
function runOp(row: Subcommand, input: LegacyInput): void {
  const address = needArg(row.name, 'a <file>#<symbol> address', input.positionals[0]);
  const resolved = resolveSymbol(input.project, parseSymbolAddress(address));
  const report = collectRefs(input.project, resolved);
  process.stdout.write(`${renderRefReport(report, input.flags['--json'])}\n`);
  row.run(input);
}

function entryToPositionals(entry: unknown): readonly string[] {
  if (Array.isArray(entry) && entry.every((arg) => typeof arg === 'string')) {
    return entry as readonly string[];
  }
  throw new Error('Each manifest entry must be an array of string arguments.');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const name = argv[0];
  const row = SUBCOMMANDS.find((candidate) => candidate.name === name);
  if (row === undefined) {
    const lead =
      name === undefined
        ? 'refactor: missing subcommand.'
        : `refactor: unknown subcommand '${name}'.`;
    process.stderr.write(`${lead}\n${USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  const flags = parseFlags(argv, FLAG_SCHEMA);
  const project = loadRefactorProject();

  const manifest = readManifest(argv);
  if (manifest === null) {
    const positionals = argv.slice(1).filter((arg) => !arg.startsWith('--'));
    runOp(row, { project, positionals, flags });
  } else {
    for (const entry of manifest) {
      runOp(row, { project, positionals: entryToPositionals(entry), flags });
    }
  }

  if (!flags['--dry']) await project.save();
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exitCode = 1;
});
