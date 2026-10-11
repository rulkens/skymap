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
 * on disk is always trustworthy as "already fetched". Star octree chunks are
 * never in the manifest: each manifested v2 index names its own, so they are
 * listed from the index header and fetched after the manifest's files.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, posix } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import type { DataManifest } from '../../src/@types/data/DataManifest';
import type { OctreeIndexHeader } from '../../src/@types/octree/OctreeIndexHeader';
import {
  OCTREE_INDEX_MAGIC,
  STAR_OCTREE_DATA_PREFIX,
  starChunkPath,
} from '../../src/data/octree/octreeFormat';
import { readOctreeHeader } from '../../src/data/octree/readOctreeHeader';
import { readEnvProductionValue } from '../utils/io/readEnvProductionValue';

const DATA_DIR = 'public/data';

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

/** Every chunk path one star index names; a dry run reads a not-yet-fetched index over the wire. */
async function starChunkPaths(host: string, logicalPath: string, hashedPath: string) {
  const destPath = join(DATA_DIR, hashedPath);
  let buf: ArrayBuffer;
  if (existsSync(destPath)) {
    const bytes = readFileSync(destPath);
    buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  } else {
    const res = await fetch(`${host}/data/${hashedPath}`);
    if (!res.ok) throw new Error(`GET ${host}/data/${hashedPath} -> HTTP ${res.status}`);
    buf = await res.arrayBuffer();
  }
  const { header } = readOctreeHeader<OctreeIndexHeader>(buf, OCTREE_INDEX_MAGIC);
  return header.chunks.map((ref) => starChunkPath(basename(logicalPath, '.bin'), ref));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  const host = readEnvProductionValue('VITE_DATA_BASE_URL');
  process.stderr.write(`fetchPrebuiltData: manifest ${host}/data/manifest.json\n`);
  const manifest = await fetchManifest(host);

  const selected = Object.keys(manifest).sort();
  const files = selected.map((logicalPath) => ({
    logicalPath,
    hashedPath: manifest[logicalPath]!,
  }));
  for (const logicalPath of selected) {
    if (posix.dirname(logicalPath) !== STAR_OCTREE_DATA_PREFIX) continue;
    for (const chunkPath of await starChunkPaths(host, logicalPath, manifest[logicalPath]!)) {
      files.push({ logicalPath: chunkPath, hashedPath: chunkPath });
    }
  }

  process.stderr.write(
    `  ${selected.length} manifest entries selected, ${files.length - selected.length} star chunks\n`,
  );

  let presentBytes = 0;
  let toDownloadBytes = 0;
  const rows: { logicalPath: string; hashedPath: string; size: number; cached: boolean }[] = [];
  for (const { logicalPath, hashedPath } of files) {
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
