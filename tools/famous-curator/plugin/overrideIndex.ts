/**
 * overrideIndex — read-modify-write helper for the curator's override
 * JSON (`data/seeds/famous_curated_overrides.json`).
 *
 * Write strategy: load the current index (or {} if missing), mutate the
 * `entries[id]` slot, write to `<path>.tmp`, then `rename(<path>.tmp,
 * <path>)`.  rename(2) is atomic on POSIX, so a crash mid-write never
 * leaves a half-written file in place.
 *
 * Concurrency: read-modify-write is NOT safe under truly concurrent
 * writers (two simultaneous calls would each load the same baseline +
 * lose one's change).  The curator is single-user local-only, so this
 * is fine in practice; if we ever multi-user this we'd need a lockfile.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export type OverrideEntry = {
  dir: string;
  sourceUrl: string;
  license: string;
  author: string;
  processedAt: string;
};

export type OverrideIndex = {
  version: 1;
  entries: Record<string, OverrideEntry>;
};

export function loadOverrideIndex(path: string): OverrideIndex {
  if (!existsSync(path)) {
    return { version: 1, entries: {} };
  }
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<OverrideIndex>;
  if (raw.version !== 1 || typeof raw.entries !== 'object' || raw.entries === null) {
    throw new Error(`override index at ${path}: malformed (expected version 1)`);
  }
  return { version: 1, entries: raw.entries as Record<string, OverrideEntry> };
}

export function upsertOverrideEntry(path: string, id: string, entry: OverrideEntry): OverrideIndex {
  const idx = loadOverrideIndex(path);
  idx.entries[id] = entry;
  const json = JSON.stringify(idx, null, 2) + '\n';
  const tmpPath = `${path}.tmp`;
  writeFileSync(tmpPath, json);
  renameSync(tmpPath, path);
  return idx;
}
