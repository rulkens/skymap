/**
 * readManifest — read a `--manifest <path>` value flag into a JSON array, the
 * one place the refactor CLI (and, once Task 10 rewires it, moveFiles) parses a
 * batch file.
 *
 * ## Why a shared helper rather than a per-command `indexOf` idiom
 *
 * Every subcommand accepts a batch form: `refactor <sub> --manifest ops.json`.
 * The mechanics are identical each time — find the flag, read the file, parse
 * JSON, insist it is an array — so a second hand-rolled copy of the
 * `indexOf('--manifest')` loop would be the exact duplication the plan calls out
 * as a consolidate trigger. `parseFlags` deliberately stays bool-only (see its
 * header), so the lone value flag lives here instead of growing that parser.
 *
 * ## Why the element type stays `unknown`
 *
 * The array's ELEMENT shape is per-subcommand (a `move` entry is `{from,to}`; a
 * `rename` entry is a different tuple). Validating those belongs to each
 * subcommand's own arg parsing, which knows what a valid entry looks like and can
 * report a precise error. This helper proves only the two things every manifest
 * shares — the flag has a path, and the file parses to an array — and hands the
 * untyped rows on. Typing the rows here would either lie (a single shape can't
 * cover six subcommands) or force a union this layer has no business owning.
 *
 * ## Why failures throw
 *
 * A missing path argument, an unreadable file, or a non-array parse are all
 * operator error that can only produce a nonsensical batch downstream, so we
 * reject them here with a message naming the offending input rather than handing
 * back an empty or half-formed result a caller might run anyway.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function readManifest(argv: readonly string[]): readonly unknown[] | null {
  const manifestIdx = argv.indexOf('--manifest');
  if (manifestIdx === -1) return null;

  const manifestPath = argv[manifestIdx + 1];
  if (!manifestPath) throw new Error('--manifest requires a path argument.');

  let text: string;
  try {
    text = readFileSync(resolve(manifestPath), 'utf8');
  } catch {
    throw new Error(`Cannot read manifest '${manifestPath}'.`);
  }

  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error(`Manifest '${manifestPath}' must be a JSON array.`);
  }
  return parsed;
}
