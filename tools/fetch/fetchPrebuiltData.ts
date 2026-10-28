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
 * on disk is always trustworthy as "already fetched". Octree chunks are
 * never in the manifest: each manifested index of an `OCTREE_CATALOGS` catalog names its own, and each chunk
 * the next depth's, so they are listed by reading headers down the tree (off
 * disk, else by a ranged GET of the header alone) and fetched with the rest.
 */
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

import type { OctreeCatalog } from '../deploy/@types/OctreeCatalog';
import { OCTREE_CATALOGS } from '../deploy/r2/octreeCatalogs';
import type { DataManifest } from '../../src/@types/data/DataManifest';
import type { OctreeChunkHeader } from '../../src/@types/octree/OctreeChunkHeader';
import type { OctreeChunkRef } from '../../src/@types/octree/OctreeChunkRef';
import type { OctreeIndexHeader } from '../../src/@types/octree/OctreeIndexHeader';
import {
  OCTREE_CHUNK_MAGIC,
  OCTREE_HEADER_BYTES_OFFSET,
  OCTREE_INDEX_MAGIC,
  OCTREE_JSON_OFFSET,
} from '../../src/data/octree/octreeFormat';
import { OCTREE_FAMILIES } from '../../src/data/octree/octreeFamilies';
import { octreeChunkPath } from '../../src/utils/octree/octreeChunkPath';
import { readOctreeHeader } from '../../src/data/octree/readOctreeHeader';
import { readEnvProductionValue } from '../utils/io/readEnvProductionValue';
import { readOctreeFileHeader } from '../utils/io/readOctreeFileHeader';

const DATA_DIR = 'public/data';
// A leaf's header fits; a parent's (≤ ~20 KB on the real bake) takes a second, exact read.
const HEADER_PROBE_BYTES = 4096;

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

/** An octree object's header: off disk when present, else a ranged GET of its first bytes. */
async function octreeHeader<H extends OctreeIndexHeader | OctreeChunkHeader>(
  host: string,
  dataDir: string,
  path: string,
  magic: string,
): Promise<H> {
  const localPath = join(dataDir, path);
  if (existsSync(localPath)) return readOctreeFileHeader<H>(localPath, magic);
  const url = `${host}/data/${path}`;
  const head = async (bytes: number) => {
    const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
    if (!res.ok) throw new Error(`GET ${url} (ranged) -> HTTP ${res.status}`);
    return res.arrayBuffer();
  };
  let buf = await head(HEADER_PROBE_BYTES);
  const span = OCTREE_JSON_OFFSET + new DataView(buf).getUint32(OCTREE_HEADER_BYTES_OFFSET, true);
  if (buf.byteLength < span) buf = await head(span);
  return readOctreeHeader<H>(buf, magic).header;
}

/** Every chunk path one octree catalog's index names, at every depth, read off headers only. */
export async function octreeChunkPaths(
  host: string,
  dataDir: string,
  catalog: OctreeCatalog,
  hashedPath: string,
): Promise<string[]> {
  const paths: string[] = [];
  const walk = async (refs: readonly OctreeChunkRef[]) => {
    for (const ref of refs) {
      const path = octreeChunkPath(catalog.family, catalog.name, ref);
      paths.push(path);
      await walk(
        (await octreeHeader<OctreeChunkHeader>(host, dataDir, path, OCTREE_CHUNK_MAGIC)).chunks,
      );
    }
  };
  await walk(
    (await octreeHeader<OctreeIndexHeader>(host, dataDir, hashedPath, OCTREE_INDEX_MAGIC)).chunks,
  );
  return paths;
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
  for (const catalog of OCTREE_CATALOGS) {
    const logicalPath = `${OCTREE_FAMILIES[catalog.family].dataPrefix}/${catalog.name}.bin`;
    const hashedPath = manifest[logicalPath];
    if (hashedPath === undefined) continue;
    for (const chunkPath of await octreeChunkPaths(host, DATA_DIR, catalog, hashedPath)) {
      files.push({ logicalPath: chunkPath, hashedPath: chunkPath });
    }
  }

  process.stderr.write(
    `  ${selected.length} manifest entries selected, ${files.length - selected.length} octree chunks\n`,
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
