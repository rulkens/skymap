#!/usr/bin/env node
/**
 * fetchPrebuiltData — pull the deployed `manifest.json` and everything it
 * names into `public/data/`, so a fresh checkout can `npm run dev` against
 * real data without the multi-hour catalog build. Mirrors `dataUrl()`'s own
 * resolution (docs/DATA.md, docs/DEPLOY.md), from Node instead of the
 * browser. `manifest.json` only ever names `allowDataFile`'s tracked set —
 * Earth tiles, hi-res images and textures live in separate R2 groups that
 * never touch it, and fonts ship git-tracked under `public/fonts/` — so
 * nothing here has to special-case excluding them. A download lands at
 * `<dest>.part`, renamed into place only on success, so a same-named file
 * on disk is always trustworthy as "already fetched".
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import type { DataManifest } from '../../src/@types/data/DataManifest';
import type { SourceEntry } from '../../src/@types/data/SourceEntry';
import { SOURCE_ENTRIES } from '../../src/data/sourceEntries';
import { readEnvProductionValue } from '../utils/io/readEnvProductionValue';

const DATA_DIR = 'public/data';
const TIERS = ['small', 'medium', 'large'] as const;

/**
 * `.scfd` filename -> its registry row's `visible` default, for every
 * volume/flow entry that has an on-disk file. A `.scfd` can be live on R2
 * with NO row at all — a data pipeline that shipped ahead of its renderer
 * wiring (e.g. the Edenhofer dust volume) — so this is deliberately a
 * lookup, not a blocklist: an unlisted file is exactly as "not visible" as
 * one that's registered `visible: false`, and both stay out of the default
 * pull. `src/data/sources/*` is the single source of visibility truth, so
 * the registered half of this can't drift from what the app defaults to.
 */
export function volumeVisibilityByFileName(entries: readonly SourceEntry[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const entry of entries) {
    if (entry.type !== 'volume' && entry.type !== 'flow') continue;
    const base = entry.binBaseName;
    if (base == null) continue; // procedural debug fixtures have no on-disk file
    const fileNames =
      entry.type === 'volume' && entry.tiered
        ? TIERS.map((tier) => `${base}-${tier}.scfd`)
        : [`${base}.scfd`];
    for (const fileName of fileNames) map.set(fileName, entry.visible);
  }
  return map;
}

/**
 * Manifest logical paths to download. Every non-volume family (galaxy
 * catalogs, star catalogs, structures, filaments, root JSON) always passes;
 * a `scalar-field/` entry passes only when its filename maps to `visible:
 * true`, unless `includeHiddenVolumes` (the `--volumes all` case) waves
 * every scalar-field file through regardless. Pure over the manifest so the
 * rule is unit-testable without a network call.
 */
export function selectManifestFiles(
  manifest: DataManifest,
  visibilityByFileName: ReadonlyMap<string, boolean>,
  includeHiddenVolumes: boolean,
): string[] {
  return Object.keys(manifest).filter((logicalPath) => {
    if (!logicalPath.startsWith('scalar-field/')) return true;
    if (includeHiddenVolumes) return true;
    return visibilityByFileName.get(posix.basename(logicalPath)) === true;
  });
}

async function fetchManifest(host: string): Promise<DataManifest> {
  const url = `${host}/data/manifest.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  return (await res.json()) as DataManifest;
}

/** `HEAD`'s Content-Length for a not-yet-downloaded file; `null` if absent. */
async function remoteSize(url: string): Promise<number | null> {
  const res = await fetch(url, { method: 'HEAD' });
  if (!res.ok) throw new Error(`HEAD ${url} -> HTTP ${res.status}`);
  const len = res.headers.get('Content-Length');
  return len ? Number.parseInt(len, 10) : null;
}

async function downloadFile(url: string, destPath: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  if (!res.body) throw new Error(`GET ${url} -> empty body`);

  mkdirSync(dirname(destPath), { recursive: true });
  const partPath = `${destPath}.part`;
  // `res.body` is a WHATWG ReadableStream; the cast bridges lib.dom's typing
  // and Node's stricter `fromWeb` signature — same object at runtime.
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(partPath, { flags: 'w' }));
  renameSync(partPath, destPath);
  return statSync(destPath).size;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const volumesAll = args.includes('--volumes') && args[args.indexOf('--volumes') + 1] === 'all';

  const host = readEnvProductionValue('VITE_DATA_BASE_URL');
  process.stderr.write(`fetchPrebuiltData: manifest ${host}/data/manifest.json\n`);
  const manifest = await fetchManifest(host);

  const visibility = volumeVisibilityByFileName(SOURCE_ENTRIES);
  const selected = selectManifestFiles(manifest, visibility, volumesAll).sort();
  const excluded = Object.keys(manifest).length - selected.length;

  process.stderr.write(
    `  ${selected.length} of ${Object.keys(manifest).length} manifest entries selected\n`,
  );
  if (excluded > 0) {
    process.stderr.write(
      `  (${excluded} hidden/unwired volume file(s) excluded — pass --volumes all to include)\n`,
    );
  }

  let presentBytes = 0;
  let toDownloadBytes = 0;
  const rows: { logicalPath: string; hashedPath: string; size: number; cached: boolean }[] = [];
  for (const logicalPath of selected) {
    const hashedPath = manifest[logicalPath]!;
    const destPath = join(DATA_DIR, hashedPath);
    const cached = existsSync(destPath);
    const size = cached
      ? statSync(destPath).size
      : await remoteSize(`${host}/data/${hashedPath}`).then((n) => n ?? 0);
    if (cached) presentBytes += size;
    else toDownloadBytes += size;
    rows.push({ logicalPath, hashedPath, size, cached });
  }

  process.stderr.write('\n');
  for (const row of rows) {
    process.stderr.write(
      `  ${row.cached ? '[cached]  ' : '          '}${row.size.toLocaleString().padStart(12)}  ${row.logicalPath}\n`,
    );
  }
  process.stderr.write(
    `\n  total: ${rows.length} files, ${(presentBytes + toDownloadBytes).toLocaleString()} bytes ` +
      `(${toDownloadBytes.toLocaleString()} bytes to download, ${presentBytes.toLocaleString()} already present)\n`,
  );

  if (dryRun) {
    process.stderr.write('\n--dry-run: nothing downloaded.\n');
    return;
  }

  for (const row of rows) {
    if (row.cached) continue;
    const destPath = join(DATA_DIR, row.hashedPath);
    process.stderr.write(`  GET ${row.logicalPath}\n`);
    await downloadFile(`${host}/data/${row.hashedPath}`, destPath);
  }

  // Written last, after every file it names has landed — the same ordering
  // buildDataManifest/syncR2 use, so a reload never sees a manifest that
  // outpaces the bytes it points at.
  mkdirSync(DATA_DIR, { recursive: true });
  const manifestPath = join(DATA_DIR, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stderr.write(`\ndone; wrote ${manifestPath}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
