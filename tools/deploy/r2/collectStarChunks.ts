/**
 * Every star chunk object the manifested v2 indexes name, read off each index header rather
 * than walked off disk: chunks from an earlier bake stay on disk beside the current ones, and
 * the bake writes the index last, so an interrupted bake names no chunk that is not on disk.
 */
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, posix } from 'node:path';
import type { DataManifest } from '../../../src/@types/data/DataManifest';
import type { OctreeIndexHeader } from '../../../src/@types/octree/OctreeIndexHeader';
import {
  OCTREE_INDEX_MAGIC,
  STAR_OCTREE_DATA_PREFIX,
  starChunkPath,
} from '../../../src/data/octree/octreeFormat';
import { readOctreeHeader } from '../../../src/data/octree/readOctreeHeader';
import type { R2Upload } from '../@types/R2Upload';

export function collectStarChunks(dataDir: string): R2Upload[] {
  const manifestPath = join(dataDir, 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  const manifest: DataManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return Object.entries(manifest)
    .filter(([logical]) => posix.dirname(logical) === STAR_OCTREE_DATA_PREFIX)
    .flatMap(([logical, hashed]) => {
      const bytes = readFileSync(join(dataDir, hashed));
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const { header } = readOctreeHeader<OctreeIndexHeader>(
        buf as ArrayBuffer,
        OCTREE_INDEX_MAGIC,
      );
      const binBaseName = basename(logical, '.bin');
      return header.chunks.map((ref) => {
        const rel = starChunkPath(binBaseName, ref);
        return { localPath: join(dataDir, rel), r2Key: `data/${rel}` };
      });
    });
}
