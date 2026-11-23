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
import { readFileSync } from 'node:fs';
import type { Project } from 'ts-morph';
import { collectRefs } from '../utils/refactor/collectRefs';
import { closeEngine } from '../utils/refactor/engine/closeEngine';
import { ENGINE_PROJECTS } from '../utils/refactor/engine/ENGINE_PROJECTS';
import { openEngine } from '../utils/refactor/engine/openEngine';
import { parseSymbolAddress } from '../utils/refactor/parseSymbolAddress';
import { readManifest } from '../utils/refactor/readManifest';
import { renderRefReport } from '../utils/refactor/renderRefReport';
import { resolveSymbol } from '../utils/refactor/resolveSymbol';
import type { RefReport } from '../@types/refactor/RefReport';
import type { SymbolRefKind } from '../@types/refactor/SymbolRefKind';
import type { RunInput } from './@types/RunInput';
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
    run: async ({ project, positionals, flags }) => {
      const { planRename } = await import('../utils/refactor/planRename');
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
    run: async ({ project, positionals }) => {
      const { planExtract } = await import('../utils/refactor/planExtract');
      const dest = needArg('extract', 'a <file>#<symbol> address and a <dest.ts>', positionals[1]);
      planExtract(project, resolveSymbol(project, parseSymbolAddress(positionals[0]!)), dest);
    },
  },
  {
    kind: 'legacy',
    name: 'inline',
    usage: 'refactor inline  <file>#<symbol>',
    run: async ({ project, positionals, report }) => {
      const { planInline } = await import('../utils/refactor/planInline');
      planInline(project, resolveSymbol(project, parseSymbolAddress(positionals[0]!)), report);
    },
  },
  {
    kind: 'legacy',
    name: 'delete',
    usage: 'refactor delete  <file>#<symbol>',
    run: async ({ project, positionals, report }) => {
      const { planDelete } = await import('../utils/refactor/planDelete');
      planDelete(project, resolveSymbol(project, parseSymbolAddress(positionals[0]!)), report);
    },
  },
  {
    kind: 'report',
    name: 'refs',
    usage: 'refactor refs    <file>#<symbol>',
    report: (run) => renderRefReport(referencesOf(run, run.positionals[0]), run.flags['--json']),
  },
];

const USAGE = `Usage: refactor <subcommand> <args...> [--dry] [--json]

${SUBCOMMANDS.map((row) => `  ${row.usage}`).join('\n')}

Batch form (any subcommand): refactor <subcommand> --manifest <ops.json>`;

function referencesOf(run: RunInput, address: string | undefined): RefReport<SymbolRefKind> {
  const found = collectRefs({
    address: parseSymbolAddress(needArg('refs', 'a <file>#<symbol> address', address)),
    engine: run.engine,
    read: run.read,
  });
  if (!found.ok) throw new Error(found.refusal);
  return found.report;
}

// A legacy row's preview prints the references as they stand BEFORE it mutates; for
// a refused delete it shows what blocks it. A malformed address fails here, before
// any mutation, so a batch aborts before the single save.
async function runOp(
  row: Subcommand,
  run: RunInput,
  project: () => Promise<Project>,
): Promise<void> {
  if (row.kind === 'report') {
    process.stdout.write(`${row.report(run)}\n`);
    return;
  }
  const report = referencesOf(run, run.positionals[0]);
  process.stdout.write(`${renderRefReport(report, run.flags['--json'])}\n`);
  await row.run({
    project: await project(),
    positionals: run.positionals,
    flags: run.flags,
    report,
  });
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
  const engine = openEngine({ root: process.cwd(), projects: ENGINE_PROJECTS });
  try {
    // ts-morph costs ~0.6 s to import and more to load the repo, so only a legacy row
    // pays: its planners and the project load are imported on demand.
    let loaded: Project | undefined;
    const project = async (): Promise<Project> => {
      const { loadRefactorProject } = await import('../utils/refactor/loadRefactorProject');
      return (loaded ??= loadRefactorProject());
    };
    const read = (file: string): string => engine.overlay.get(file) ?? readFileSync(file, 'utf8');
    const manifest = readManifest(argv);
    const ops =
      manifest === null
        ? [argv.slice(1).filter((arg) => !arg.startsWith('--'))]
        : manifest.map(entryToPositionals);
    for (const positionals of ops) await runOp(row, { engine, read, positionals, flags }, project);
    if (!flags['--dry'] && loaded) await loaded.save();
  } finally {
    closeEngine(engine);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exitCode = 1;
});
