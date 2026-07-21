#!/usr/bin/env node
/**
 * refactor — one ts-morph CLI whose subcommands map onto skymap's house
 * conventions (one symbol per file, filename = export name, deep relative
 * imports, no barrels): rename, extract, inline, delete, refs, move. The
 * existing `npm run move-files` folds in as the `move` subcommand.
 *
 * ## Why the entry stays thin
 *
 * This file does argv dispatch and nothing else — parse the leading subcommand,
 * resolve the bool flags, load the shared Project, run the requested op(s)
 * against it, and save once at the tail. All the real behaviour lives in
 * one-function planners under `tools/utils/refactor/`, each unit-tested against
 * an in-memory Project. Keeping the entry logic-free is the same choice
 * `moveFiles.ts` made: argv plumbing is not worth a test, and a fat entry would
 * hide the testable seams inside an untestable one.
 *
 * ## Why the driver owns the single save (all-or-nothing)
 *
 * Every mutating subcommand is a planner that resolves + validates + mutates the
 * ONE in-memory Project and throws on any validation failure WITHOUT saving. The
 * driver runs each requested op (a single invocation, or one per `--manifest`
 * batch entry) against that project, then calls `project.save()` exactly once at
 * the tail. All-or-nothing falls out structurally: a throw mid-batch aborts
 * before the save, so disk is never partially written. This mirrors
 * `applyMoves` + `moveFiles.main` today. `--dry` skips the save and (once the
 * planners land) prints the structured blast-radius report instead.
 *
 * ## Usage
 *
 *   npm run refactor -- <subcommand> <args...> [--dry] [--json]
 *
 *     refactor rename  <file>#<symbol> <newName>   [--no-file-rename]
 *     refactor extract <file>#<symbol> <dest.ts>
 *     refactor inline  <file>#<symbol>
 *     refactor delete  <file>#<symbol>
 *     refactor refs    <file>#<symbol>
 *     refactor move    <from> <to>
 *
 *   Batch form (any subcommand): refactor <subcommand> --manifest <ops.json>
 */

import type { Project } from 'ts-morph';
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

// The six subcommands. Address-taking ones name their target as `<file>#<symbol>`;
// `move` takes a `<from> <to>` path pair instead.
const ADDRESS_SUBCOMMANDS = ['rename', 'extract', 'inline', 'delete', 'refs'] as const;
const SUBCOMMANDS = [...ADDRESS_SUBCOMMANDS, 'move'] as const;
type Subcommand = (typeof SUBCOMMANDS)[number];

function isSubcommand(value: string): value is Subcommand {
  return (SUBCOMMANDS as readonly string[]).includes(value);
}

function isAddressSubcommand(sub: Subcommand): boolean {
  return (ADDRESS_SUBCOMMANDS as readonly string[]).includes(sub);
}

const USAGE = `Usage: refactor <subcommand> <args...> [--dry] [--json]

  refactor rename  <file>#<symbol> <newName>   [--no-file-rename]
  refactor extract <file>#<symbol> <dest.ts>
  refactor inline  <file>#<symbol>
  refactor delete  <file>#<symbol>
  refactor refs    <file>#<symbol>
  refactor move    <from> <to>

Batch form (any subcommand): refactor <subcommand> --manifest <ops.json>`;

const FLAG_SCHEMA = { '--dry': 'bool', '--json': 'bool', '--no-file-rename': 'bool' } as const;
type Flags = Record<keyof typeof FLAG_SCHEMA, boolean>;

// Run one op against the shared project. Address-taking subcommands parse their
// `<file>#<symbol>` here so a malformed address fails loudly BEFORE any mutation
// (and, in a batch, aborts the whole run before the single save). The planners
// that do the real work land in Tasks 4-10; every handler throws until then.
function runOp(
  sub: Subcommand,
  project: Project,
  positionals: readonly string[],
  flags: Flags,
): void {
  if (isAddressSubcommand(sub)) {
    const address = positionals[0];
    if (address === undefined) {
      throw new Error(`refactor ${sub}: expected a <file>#<symbol> address.`);
    }
    const parsed = parseSymbolAddress(address);

    if (sub === 'refs') {
      // `refs` is read-only: it resolves the target, walks its references, and
      // prints the classified report. It never mutates the project, so the
      // driver's tail `project.save()` is a no-op regardless of `--dry` — no
      // special-casing needed here.
      const report = collectRefs(project, resolveSymbol(project, parsed));
      process.stdout.write(`${renderRefReport(report, flags['--json'])}\n`);
      return;
    }

    if (sub === 'rename') {
      const newName = positionals[1];
      if (newName === undefined) {
        throw new Error('refactor rename: expected a <file>#<symbol> address and a <newName>.');
      }
      const resolved = resolveSymbol(project, parsed);
      // Print the blast radius from the PRE-rename symbol, so the report reflects
      // the references as they stand before the mutation. The shared reporter is
      // every mutating subcommand's preview; --dry stops at this report.
      const report = collectRefs(project, resolved);
      process.stdout.write(`${renderRefReport(report, flags['--json'])}\n`);
      // File rename is the default; --no-file-rename opts out (see planRename).
      planRename(project, resolved, newName, !flags['--no-file-rename']);
      return;
    }

    if (sub === 'delete') {
      const resolved = resolveSymbol(project, parsed);
      // Print the blast radius first: when refs exist it shows what blocks the
      // delete (planDelete then throws the refusal), and when clear it's an empty
      // report. --dry stops at this preview; the driver's tail save is skipped.
      const report = collectRefs(project, resolved);
      process.stdout.write(`${renderRefReport(report, flags['--json'])}\n`);
      planDelete(project, resolved);
      return;
    }

    if (sub === 'extract') {
      const dest = positionals[1];
      if (dest === undefined) {
        throw new Error('refactor extract: expected a <file>#<symbol> address and a <dest.ts>.');
      }
      const resolved = resolveSymbol(project, parsed);
      // Print the blast radius first: it previews the external importers the extract
      // will repoint, or (on a shared-dep refusal) an empty report before
      // planExtract throws. --dry stops at this preview; the tail save is skipped.
      const report = collectRefs(project, resolved);
      process.stdout.write(`${renderRefReport(report, flags['--json'])}\n`);
      planExtract(project, resolved, dest);
      return;
    }

    if (sub === 'inline') {
      const resolved = resolveSymbol(project, parsed);
      // Print the blast radius first: it previews the call sites the inline will
      // repoint, or (on a non-passthrough) the references planInline then refuses
      // with. --dry stops at this preview; the driver's tail save is skipped.
      const report = collectRefs(project, resolved);
      process.stdout.write(`${renderRefReport(report, flags['--json'])}\n`);
      planInline(project, resolved);
      return;
    }
  } else if (positionals.length !== 2) {
    throw new Error('refactor move: expected <from> <to>.');
  }

  void project;
  void flags;
  throw new Error(`refactor ${sub}: not yet implemented.`);
}

// Decode one batch entry into its positional argument tuple. Only the shape
// every subcommand shares is proven here — a JSON array of string arguments;
// per-subcommand tuple validation (arity, address well-formedness) is runOp's
// job, and richer entry shapes (move's `{from,to}`) arrive with the subcommand
// tasks that own them.
function entryToPositionals(entry: unknown): readonly string[] {
  if (Array.isArray(entry) && entry.every((arg) => typeof arg === 'string')) {
    return entry as readonly string[];
  }
  throw new Error('Each manifest entry must be an array of string arguments.');
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const sub = argv[0];
  if (sub === undefined || !isSubcommand(sub)) {
    const lead =
      sub === undefined
        ? 'refactor: missing subcommand.'
        : `refactor: unknown subcommand '${sub}'.`;
    process.stderr.write(`${lead}\n${USAGE}\n`);
    process.exitCode = 1;
    return;
  }

  const flags = parseFlags(argv, FLAG_SCHEMA);
  const project = loadRefactorProject();

  const manifest = readManifest(argv);
  if (manifest === null) {
    const positionals = argv.slice(1).filter((arg) => !arg.startsWith('--'));
    runOp(sub, project, positionals, flags);
  } else {
    // Batch: every entry runs against the ONE project. A throw on any entry
    // aborts before the single save below, so disk is never partially written.
    for (const entry of manifest) runOp(sub, project, entryToPositionals(entry), flags);
  }

  if (!flags['--dry']) await project.save();
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${message}\n\n${USAGE}\n`);
  process.exitCode = 1;
});
