/**
 * Every star chunk object the manifested v2 indexes name, read off the headers rather than
 * walked off disk: chunks from an earlier bake stay on disk beside the current ones. Chunks
 * nest, so each chunk's own header names the next depth; the bake writes children before
 * parents and the index last, so an interrupted bake names no chunk that is not on disk.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, posix } from 'node:path';
import type { DataManifest } from '../../../src/@types/data/DataManifest';
import type { OctreeChunkHeader } from '../../../src/@types/octree/OctreeChunkHeader';
import type { OctreeChunkRef } from '../../../src/@types/octree/OctreeChunkRef';
import type { OctreeIndexHeader } from '../../../src/@types/octree/OctreeIndexHeader';
import {
  OCTREE_CHUNK_MAGIC,
  OCTREE_INDEX_MAGIC,
  STAR_OCTREE_DATA_PREFIX,
  starChunkPath,
} from '../../../src/data/octree/octreeFormat';
import { readOctreeHeader } from '../../../src/data/octree/readOctreeHeader';
import type { R2Upload } from '../@types/R2Upload';

function headerOf<H extends OctreeIndexHeader | OctreeChunkHeader>(path: string, magic: string): H {
  const bytes = readFileSync(path);
  const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return readOctreeHeader<H>(buf as ArrayBuffer, magic).header;
}

export function collectStarChunks(dataDir: string): R2Upload[] {
  const manifestPath = join(dataDir, 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  const manifest: DataManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return Object.entries(manifest)
    .filter(([logical]) => posix.dirname(logical) === STAR_OCTREE_DATA_PREFIX)
    .flatMap(([logical, hashed]) => {
      const binBaseName = basename(logical, '.bin');
      const uploads: R2Upload[] = [];
      const walk = (refs: readonly OctreeChunkRef[]) => {
        for (const ref of refs) {
          const rel = starChunkPath(binBaseName, ref);
          const localPath = join(dataDir, rel);
          uploads.push({ localPath, r2Key: `data/${rel}` });
          walk(headerOf<OctreeChunkHeader>(localPath, OCTREE_CHUNK_MAGIC).chunks);
        }
      };
      walk(headerOf<OctreeIndexHeader>(join(dataDir, hashed), OCTREE_INDEX_MAGIC).chunks);
      return uploads;
    });
}
