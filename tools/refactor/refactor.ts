#!/usr/bin/env node
/**
 * refactor: the symbol-level refactoring CLI. `refs`, `rename` and `delete` run on the
 * TypeScript 7 engine; `extract` and `inline` still run on ts-morph, imported only for
 * their rows. Moving files is `npm run move-files`, not a subcommand here.
 *
 * Each op asks the engine once; every row works from that answer. A `plan` row returns a
 * plan and the driver folds each into an in-memory overlay, so a batch (`--manifest`) sees
 * its earlier entries and writes once, after the last, or not at all on a refusal or
 * under `--dry`. Behaviour lives in `tools/utils/refactor/`.
 */

import { parseFlags } from '../utils/cli/args';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import type { Project } from 'ts-morph';
import { listProjectFiles } from '../../packages/move-files/src/listProjectFiles';
import { readSnapshot } from '../../packages/move-files/src/readSnapshot';
import { collectPropRefs } from '../utils/refactor/collectPropRefs';
import { collectRefs } from '../utils/refactor/collectRefs';
import { closeEngine } from '../utils/refactor/engine/closeEngine';
import { ENGINE_PROJECTS } from '../utils/refactor/engine/ENGINE_PROJECTS';
import { openEngine } from '../utils/refactor/engine/openEngine';
import { syncOverlay } from '../utils/refactor/engine/syncOverlay';
import { foldPlan } from '../utils/refactor/foldPlan';
import { normaliseAddress } from '../utils/refactor/normaliseAddress';
import { parseTarget } from '../utils/refactor/parseTarget';
import { planDelete } from '../utils/refactor/planDelete';
import { planRename } from '../utils/refactor/planRename';
import { overlaidTexts } from '../utils/refactor/overlaidTexts';
import { readManifest } from '../utils/refactor/readManifest';
import { renderRefReport } from '../utils/refactor/renderRefReport';
import { resolveSymbol } from '../utils/refactor/resolveSymbol';
import { writePlan } from '../utils/refactor/writePlan';
import type { DiskView } from '../@types/refactor/DiskView';
import type { Finding } from '../@types/refactor/Finding';
import type { LegacyInput } from './@types/LegacyInput';
import type { OpContext } from './@types/OpContext';
import type { Overlay } from '../@types/refactor/Overlay';
import type { OverlayChanges } from '../@types/refactor/OverlayChanges';
import type { Plan } from '../@types/refactor/Plan';
import type { PlanResult } from '../@types/refactor/PlanResult';
import type { PropAddress } from '../@types/refactor/PropAddress';
import type { RefReport } from '../@types/refactor/RefReport';
import type { SymbolAddress } from '../@types/refactor/SymbolAddress';
import type { Target } from '../@types/refactor/Target';
import type { RunBase } from './@types/RunBase';
import type { Subcommand } from './@types/Subcommand';

const FLAG_SCHEMA = { '--dry': 'bool', '--json': 'bool', '--no-file-rename': 'bool' } as const;

// A `legacy` row mutates the ts-morph project after the driver printed its preview; a
// `plan` row only describes what to change. `arity` is how many positionals the row needs.
const SUBCOMMANDS: readonly Subcommand[] = [
  {
    accepts: 'symbol',
    kind: 'plan',
    name: 'rename',
    arity: 2,
    usage: 'refactor rename  <file>#<symbol> <newName>   [--no-file-rename]',
    plan: ({ engine, address, found, read, exists, positionals, flags }) =>
      planRename({
        address,
        found,
        newName: positionals[1] ?? '',
        renameFile: !flags['--no-file-rename'],
        root: engine.root,
        read,
        exists,
      }),
  },
  {
    accepts: 'symbol',
    kind: 'legacy',
    name: 'extract',
    arity: 2,
    usage: 'refactor extract <file>#<symbol> <dest.ts>',
    run: async ({ project, address, positionals }) => {
      const { planExtract } = await import('../utils/refactor/planExtract');
      planExtract(project, resolveSymbol(project, address), positionals[1] ?? '');
    },
  },
  {
    accepts: 'symbol',
    kind: 'legacy',
    name: 'inline',
    arity: 1,
    usage: 'refactor inline  <file>#<symbol>',
    run: async ({ project, address, report }) => {
      const { planInline } = await import('../utils/refactor/planInline');
      planInline(project, resolveSymbol(project, address), report);
    },
  },
  {
    accepts: 'symbol',
    kind: 'plan',
    name: 'delete',
    arity: 1,
    usage: 'refactor delete  <file>#<symbol>',
    plan: ({ engine, address, found, read, exists }) =>
      planDelete({ found, root: engine.root, read, exists }),
  },
  {
    accepts: 'symbol',
    kind: 'report',
    name: 'refs',
    arity: 1,
    usage: 'refactor refs    <file>#<symbol>',
    report: ({ found, flags }) => renderRefReport(found.report, flags['--json']),
  },
  {
    accepts: 'prop',
    kind: 'report',
    name: 'prop-refs',
    arity: 1,
    usage: 'refactor prop-refs <file>#<Type>.<prop>',
    report: ({ found, address, flags }) =>
      renderRefReport(found.report, flags['--json'], {
        prop: address.prop,
        findings: found.unreported,
      }),
  },
];

const USAGE = `Usage: refactor <subcommand> <args...> [--dry] [--json]

${SUBCOMMANDS.map((row) => `  ${row.usage}`).join('\n')}

Batch form (any subcommand): refactor <subcommand> --manifest <ops.json>`;

// Before any engine query: a property address given to a symbol row, or the other way.
function wrongKind(row: Subcommand, target: string, given: Target['kind']): string {
  const use = SUBCOMMANDS.filter((other) => other.accepts === given).map((other) => other.name);
  const noun = given === 'prop' ? 'property' : 'symbol';
  return `refactor ${row.name}: '${target}' is a ${noun} address; use ${use.join(', ')}.`;
}

function refuse(message: string): false {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
  return false;
}

// Argument errors throw before anything runs, so a batch aborts before it writes. One
// engine query serves the preview and the row.
async function runOp(row: Subcommand, base: RunBase, context: OpContext): Promise<boolean> {
  const [target] = base.positionals;
  if (target === undefined || base.positionals.length < row.arity) {
    throw new Error(`refactor ${row.name}: missing arguments.\n  ${row.usage}`);
  }
  const parsed = parseTarget(target);
  if (row.accepts === 'prop' && parsed.kind === 'prop') {
    const { file, typeName, prop } = parsed;
    return runPropOp(row, { file, typeName, prop }, base, context);
  }
  if (row.accepts === 'symbol' && parsed.kind === 'symbol') {
    return runSymbolOp(row, { file: parsed.file, symbol: parsed.symbol }, base, context);
  }
  throw new Error(wrongKind(row, target, parsed.kind));
}

// A legacy row's preview shows the references as they stand BEFORE it mutates, and in a
// batch the disk may no longer hold what ts-morph does, so there a preview that cannot be
// built is skipped.
async function runSymbolOp(
  row: Subcommand & { accepts: 'symbol' },
  typed: SymbolAddress,
  base: RunBase,
  context: OpContext,
): Promise<boolean> {
  const target = base.positionals[0] ?? '';
  const normal = normaliseAddress(base.engine.root, typed);
  const found = normal.ok
    ? collectRefs({ address: normal.address, engine: base.engine, read: base.read })
    : normal;

  if (!found.ok) {
    if (row.kind !== 'legacy' || !context.batch) return refuse(found.refusal);
    process.stdout.write(`preview unavailable: ${found.refusal}\n`);
    const empty = { target, refs: [], fileCount: 0, testCount: 0 };
    await runLegacy(row, base, context, typed, empty);
    return true;
  }

  const address = normal.ok ? normal.address : typed;
  const run = { ...base, address, found };
  if (row.kind === 'report') {
    process.stdout.write(`${row.report(run)}\n`);
    return true;
  }
  if (row.kind === 'plan') return acceptPlan(row.plan(run), found.report, base, context);
  process.stdout.write(`${renderRefReport(found.report, base.flags['--json'])}\n`);
  await runLegacy(row, base, context, typed, found.report);
  return true;
}

async function runPropOp(
  row: Subcommand & { accepts: 'prop' },
  typed: PropAddress,
  base: RunBase,
  context: OpContext,
): Promise<boolean> {
  const normal = normaliseAddress(base.engine.root, typed);
  if (!normal.ok) return refuse(normal.refusal);
  const found = collectPropRefs({
    address: normal.address,
    engine: base.engine,
    read: base.read,
    texts: context.texts,
  });
  if (!found.ok) return refuse(found.refusal);
  const run = { ...base, address: normal.address, found: found.found };
  if (row.kind === 'report') {
    process.stdout.write(`${row.report(run)}\n`);
    return true;
  }
  return acceptPlan(row.plan(run), found.found.report, base, context);
}

// A plan row's preview follows its acceptance, and only when something references the
// target, since a refusal carries its own list.
function acceptPlan(
  result: PlanResult,
  report: RefReport<string>,
  base: RunBase,
  context: OpContext,
): boolean {
  if (!result.ok) return refuse(result.refusals.join('\n'));
  if (report.refs.length > 0) {
    process.stdout.write(`${renderRefReport(report, base.flags['--json'])}\n`);
  }
  context.apply(result.plan);
  context.findings.push(...result.plan.findings);
  return true;
}

async function runLegacy(
  row: Subcommand & { kind: 'legacy' },
  base: RunBase,
  context: OpContext,
  address: SymbolAddress,
  report: LegacyInput['report'],
): Promise<void> {
  await row.run({
    project: await context.project(),
    address,
    positionals: base.positionals,
    flags: base.flags,
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
  const root = realpathSync.native(process.cwd());
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
    const manifest = readManifest(argv);
    const context: OpContext = {
      project,
      findings,
      batch: manifest !== null,
      texts: () => overlaidTexts(disk.snapshot().texts, engine),
      apply: (plan: Plan) => {
        if (!(last && flags['--dry'])) unsynced = foldPlan(plan, overlay, disk);
      },
    };
    const ops =
      manifest === null
        ? [argv.slice(1).filter((arg) => !arg.startsWith('--'))]
        : manifest.map(entryToPositionals);
    for (const [index, positionals] of ops.entries()) {
      last = index === ops.length - 1;
      if (unsynced) syncOverlay(engine, unsynced);
      unsynced = undefined;
      if (!(await runOp(row, { engine, read, exists, positionals, flags }, context))) return;
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
