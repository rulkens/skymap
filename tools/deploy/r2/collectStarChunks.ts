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
import { OCTREE_CHUNK_MAGIC, OCTREE_INDEX_MAGIC } from '../../../src/data/octree/octreeFormat';
import { OCTREE_FAMILIES } from '../../../src/data/octree/octreeFamilies';
import { octreeChunkPath } from '../../../src/utils/octree/octreeChunkPath';
import { readOctreeFileHeader } from '../../utils/io/readOctreeFileHeader';
import type { R2Upload } from '../@types/R2Upload';

export function collectStarChunks(dataDir: string): R2Upload[] {
  const manifestPath = join(dataDir, 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  const manifest: DataManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return Object.entries(manifest)
    .filter(([logical]) => posix.dirname(logical) === OCTREE_FAMILIES.star.dataPrefix)
    .flatMap(([logical, hashed]) => {
      const binBaseName = basename(logical, '.bin');
      const uploads: R2Upload[] = [];
      const walk = (refs: readonly OctreeChunkRef[]) => {
        for (const ref of refs) {
          const rel = octreeChunkPath('star', binBaseName, ref);
          const localPath = join(dataDir, rel);
          uploads.push({ localPath, r2Key: `data/${rel}` });
          walk(readOctreeFileHeader<OctreeChunkHeader>(localPath, OCTREE_CHUNK_MAGIC).chunks);
        }
      };
      walk(
        readOctreeFileHeader<OctreeIndexHeader>(join(dataDir, hashed), OCTREE_INDEX_MAGIC).chunks,
      );
      return uploads;
    });
}
