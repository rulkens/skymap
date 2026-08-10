#!/usr/bin/env node
/**
 * buildDataManifest — post-pass over `public/data/`: content-hash every
 * tracked file (per `allowDataFile`), rename it in place, and write
 * `manifest.json` mapping logical → hashed path. One file per logical name:
 * a logical file on disk is authoritative and gets hashed into place,
 * deleting stale hashed variants; with none present the lone survivor is
 * re-verified against its own bytes. That makes the pass idempotent — a
 * second run over unchanged bytes touches nothing. Rationale ("why a
 * post-pass") is Task 11 of docs/superpowers/plans/2026-08-10-galaxy-format-v9-mass.md.
 */
import {
  existsSync,
  lstatSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DataManifest } from '../../src/@types/data/DataManifest';
import { contentHash8 } from '../utils/data/contentHash8';
import { hashedDataName } from '../utils/data/hashedDataName';
import { logicalDataName } from '../utils/data/logicalDataName';
import { walkDataFiles } from '../utils/data/walkDataFiles';
import { allowDataFile } from './r2/allowDataFile';

function logicalRelPath(rel: string): string {
  const dir = posix.dirname(rel);
  const base = logicalDataName(posix.basename(rel));
  return dir === '.' ? base : posix.join(dir, base);
}

function hashedRelPath(logicalRel: string, hash: string): string {
  const dir = posix.dirname(logicalRel);
  const base = hashedDataName(posix.basename(logicalRel), hash);
  return dir === '.' ? base : posix.join(dir, base);
}

/** Resolve a group's keeper: the correctly-hashed relative path, renaming a
 * stale name into place if needed. Returns the keeper and whether a rename
 * happened. */
function resolveKeeper(
  dataDir: string,
  logicalRel: string,
  hasLogical: boolean,
  variants: readonly string[],
): { keeper: string; renamedOne: boolean } {
  if (hasLogical) {
    const bytes = readFileSync(join(dataDir, logicalRel));
    const hashedRel = hashedRelPath(logicalRel, contentHash8(bytes));
    renameSync(join(dataDir, logicalRel), join(dataDir, hashedRel));
    return { keeper: hashedRel, renamedOne: true };
  }

  // No logical file: the correctly-named variant (if any) is already the
  // keeper — sorted so a corrupted tree with several stale variants
  // resolves deterministically rather than by directory-listing order.
  const sorted = [...variants].sort();
  for (const v of sorted) {
    const bytes = readFileSync(join(dataDir, v));
    if (v === hashedRelPath(logicalRel, contentHash8(bytes)))
      return { keeper: v, renamedOne: false };
  }
  const v = sorted[0]!;
  const bytes = readFileSync(join(dataDir, v));
  const hashedRel = hashedRelPath(logicalRel, contentHash8(bytes));
  renameSync(join(dataDir, v), join(dataDir, hashedRel));
  return { keeper: hashedRel, renamedOne: true };
}

export function buildDataManifest(dataDir: string): DataManifest {
  // A worktree's public/data can be a symlink into the main checkout
  // (`/link-data`); renaming through it would hash-convert data out from
  // under a checkout whose code may predate or postdate this regime.
  if (lstatSync(dataDir).isSymbolicLink()) {
    process.stderr.write(
      `buildDataManifest: ${dataDir} is a symlink — skipping (a linked tree belongs to the checkout that built it).\n`,
    );
    return {};
  }

  const tracked = walkDataFiles(dataDir).filter(allowDataFile);

  const groups = new Map<string, string[]>();
  for (const rel of tracked) {
    const logicalRel = logicalRelPath(rel);
    const list = groups.get(logicalRel);
    if (list) list.push(rel);
    else groups.set(logicalRel, [rel]);
  }

  const manifest: Record<string, string> = {};
  let renamed = 0;
  let removed = 0;

  for (const [logicalRel, variants] of groups) {
    const hasLogical = variants.includes(logicalRel);
    const { keeper, renamedOne } = resolveKeeper(dataDir, logicalRel, hasLogical, variants);
    if (renamedOne) renamed++;
    for (const v of variants) {
      if (v === keeper || v === logicalRel) continue; // logicalRel no longer exists post-rename
      if (existsSync(join(dataDir, v))) {
        unlinkSync(join(dataDir, v));
        removed++;
      }
    }
    manifest[logicalRel] = keeper;
  }

  const sorted: Record<string, string> = {};
  for (const key of Object.keys(manifest).sort()) sorted[key] = manifest[key]!;
  writeFileSync(join(dataDir, 'manifest.json'), `${JSON.stringify(sorted, null, 2)}\n`);

  process.stderr.write(
    `buildDataManifest: ${groups.size} entries, ${renamed} renamed, ${removed} removed\n`,
  );
  return sorted;
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  buildDataManifest(resolve('public/data'));
}
