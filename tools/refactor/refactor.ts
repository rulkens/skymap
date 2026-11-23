#!/usr/bin/env node
/**
 * refactor: the symbol-level refactoring CLI. `refs`, `rename` and `delete` run on the
 * TypeScript 7 engine; `extract` and `inline` still run on ts-morph, imported only for
 * their rows. Moving files is `npm run move-files`, not a subcommand here.
 *
 * A `plan` row returns a plan and the driver folds each into an in-memory overlay, so a
 * batch (`--manifest`) sees its earlier entries and writes once, after the last, or
 * not at all on a refusal or under `--dry`. Behaviour lives in `tools/utils/refactor/`.
 */

import { parseFlags } from '../utils/cli/args';
import { existsSync, readFileSync } from 'node:fs';
import type { Project } from 'ts-morph';
import { listProjectFiles } from '../../packages/move-files/src/listProjectFiles';
import { readSnapshot } from '../../packages/move-files/src/readSnapshot';
import { collectRefs } from '../utils/refactor/collectRefs';
import { closeEngine } from '../utils/refactor/engine/closeEngine';
import { ENGINE_PROJECTS } from '../utils/refactor/engine/ENGINE_PROJECTS';
import { openEngine } from '../utils/refactor/engine/openEngine';
import { syncOverlay } from '../utils/refactor/engine/syncOverlay';
import { foldPlan } from '../utils/refactor/foldPlan';
import { parseSymbolAddress } from '../utils/refactor/parseSymbolAddress';
import { planDelete } from '../utils/refactor/planDelete';
import { planRename } from '../utils/refactor/planRename';
import { readManifest } from '../utils/refactor/readManifest';
import { renderRefReport } from '../utils/refactor/renderRefReport';
import { resolveSymbol } from '../utils/refactor/resolveSymbol';
import { writePlan } from '../utils/refactor/writePlan';
import type { DiskView } from '../@types/refactor/DiskView';
import type { Finding } from '../@types/refactor/Finding';
import type { Overlay } from '../@types/refactor/Overlay';
import type { OverlayChanges } from '../@types/refactor/OverlayChanges';
import type { Plan } from '../@types/refactor/Plan';
import type { RefReport } from '../@types/refactor/RefReport';
import type { SymbolRefKind } from '../@types/refactor/SymbolRefKind';
import type { RunInput } from './@types/RunInput';
import type { Subcommand } from './@types/Subcommand';

const FLAG_SCHEMA = { '--dry': 'bool', '--json': 'bool', '--no-file-rename': 'bool' } as const;

function needArg(name: string, what: string, value: string | undefined): string {
  if (value === undefined) throw new Error(`refactor ${name}: expected ${what}.`);
  return value;
}

// A `legacy` row mutates the ts-morph project after the driver printed its preview; a
// `plan` row only describes what to change.
const SUBCOMMANDS: readonly Subcommand[] = [
  {
    kind: 'plan',
    name: 'rename',
    usage: 'refactor rename  <file>#<symbol> <newName>   [--no-file-rename]',
    plan: ({ engine, read, exists, positionals, flags }) =>
      planRename({
        address: parseSymbolAddress(
          needArg('rename', 'a <file>#<symbol> address and a <newName>', positionals[0]),
        ),
        newName: needArg('rename', 'a <file>#<symbol> address and a <newName>', positionals[1]),
        renameFile: !flags['--no-file-rename'],
        engine,
        read,
        exists,
      }),
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
    kind: 'plan',
    name: 'delete',
    usage: 'refactor delete  <file>#<symbol>',
    plan: ({ engine, read, exists, positionals }) =>
      planDelete({
        address: parseSymbolAddress(needArg('delete', 'a <file>#<symbol> address', positionals[0])),
        engine,
        read,
        exists,
      }),
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

// A malformed address fails before any mutation, so a batch aborts before it writes.
// A legacy row's preview shows the references as they stand BEFORE it mutates; a plan
// row's shows them after the plan was accepted, since a refusal carries its own list.
async function runOp(
  row: Subcommand,
  run: RunInput,
  context: {
    project: () => Promise<Project>;
    apply: (plan: Plan) => void;
    findings: Finding[];
  },
): Promise<boolean> {
  if (row.kind === 'report') {
    process.stdout.write(`${row.report(run)}\n`);
    return true;
  }
  if (row.kind === 'plan') {
    const result = row.plan(run);
    if (!result.ok) {
      process.stderr.write(`${result.refusals.join('\n')}\n`);
      process.exitCode = 1;
      return false;
    }
    const preview = renderRefReport(referencesOf(run, run.positionals[0]), run.flags['--json']);
    process.stdout.write(`${preview}\n`);
    context.apply(result.plan);
    context.findings.push(...result.plan.findings);
    return true;
  }
  const report = referencesOf(run, run.positionals[0]);
  process.stdout.write(`${renderRefReport(report, run.flags['--json'])}\n`);
  await row.run({
    project: await context.project(),
    positionals: run.positionals,
    flags: run.flags,
    report,
  });
  return true;
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
  const root = process.cwd();
  const engine = openEngine({ root, projects: ENGINE_PROJECTS });
  try {
    // ts-morph costs ~0.6 s to import and more to load the repo, so only a legacy row
    // pays: its planners and the project load are imported on demand.
    let loaded: Project | undefined;
    const project = async (): Promise<Project> => {
      const { loadRefactorProject } = await import('../utils/refactor/loadRefactorProject');
      return (loaded ??= loadRefactorProject());
    };
    const overlay: Overlay = { texts: engine.overlay, moves: [], deletes: engine.removed };
    let snapshot: ReturnType<DiskView['snapshot']> | undefined;
    const disk: DiskView = {
      read: (file) => readFileSync(file, 'utf8'),
      snapshot: () => (snapshot ??= readSnapshot(listProjectFiles(root))),
    };
    const read = (file: string): string => engine.overlay.get(file) ?? disk.read(file);
    const exists = (file: string): boolean =>
      !engine.removed.has(file) && (engine.overlay.has(file) || existsSync(file));
    const findings: Finding[] = [];
    // Folding and the engine resync cost seconds on a file move, so each happens only
    // when something reads its result: the resync before a next entry, the fold before
    // that or before the write.
    let last = false;
    let unsynced: OverlayChanges | undefined;
    const context = {
      project,
      findings,
      apply: (plan: Plan) => {
        if (!(last && flags['--dry'])) unsynced = foldPlan(plan, overlay, disk);
      },
    };
    const manifest = readManifest(argv);
    const ops =
      manifest === null
        ? [argv.slice(1).filter((arg) => !arg.startsWith('--'))]
        : manifest.map(entryToPositionals);
    for (const [index, positionals] of ops.entries()) {
      last = index === ops.length - 1;
      if (unsynced) syncOverlay(engine, unsynced);
      unsynced = undefined;
      const run = { engine, read, exists, positionals, flags };
      if (!(await runOp(row, run, context))) return;
    }
    if (flags['--dry']) return;
    if (loaded) await loaded.save();
    const written = writePlan(overlay, root);
    if (written.failed !== null) {
      throw new Error(`Writing stopped at ${written.failed}; ${written.completed.length} done.`);
    }
    for (const f of findings) process.stdout.write(`${f.file}:${f.line}  ${f.message}\n`);
    if (findings.length > 0) process.exitCode = 1;
  } finally {
    closeEngine(engine);
  }
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exitCode = 1;
});
