/**
 * Every chunk object the manifested indexes of one octree catalog name, read off the headers rather than
 * walked off disk: chunks from an earlier bake stay on disk beside the current ones. Chunks
 * nest, so each chunk's own header names the next depth; the bake writes children before
 * parents and the index last, so an interrupted bake names no chunk that is not on disk. An index
 * with a `chunkDirectory` has an info sibling beside every chunk; one without (stars) has none.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DataManifest } from '../../../src/@types/data/DataManifest';
import type { OctreeChunkHeader } from '../../../src/@types/octree/OctreeChunkHeader';
import type { OctreeChunkRef } from '../../../src/@types/octree/OctreeChunkRef';
import type { OctreeIndexHeader } from '../../../src/@types/octree/OctreeIndexHeader';
import { OCTREE_CHUNK_MAGIC, OCTREE_INDEX_MAGIC } from '../../../src/data/octree/octreeFormat';
import { OCTREE_FAMILIES } from '../../../src/data/octree/octreeFamilies';
import { octreeChunkInfoPath } from '../../../src/utils/octree/octreeChunkInfoPath';
import { octreeChunkPath } from '../../../src/utils/octree/octreeChunkPath';
import { readOctreeFileHeader } from '../../utils/io/readOctreeFileHeader';
import type { OctreeCatalog } from '../@types/OctreeCatalog';
import type { R2Upload } from '../@types/R2Upload';

export function collectOctreeChunks(dataDir: string, catalog: OctreeCatalog): R2Upload[] {
  const indexLogical = `${OCTREE_FAMILIES[catalog.family].dataPrefix}/${catalog.name}.bin`;
  const manifestPath = join(dataDir, 'manifest.json');
  if (!existsSync(manifestPath)) return [];
  const manifest: DataManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  return Object.entries(manifest)
    .filter(([logical]) => logical === indexLogical)
    .flatMap(([logical, hashed]) => {
      const uploads: R2Upload[] = [];
      const index = readOctreeFileHeader<OctreeIndexHeader>(
        join(dataDir, hashed),
        OCTREE_INDEX_MAGIC,
      );
      const rels = (ref: OctreeChunkRef) => [
        octreeChunkPath(catalog.family, catalog.name, ref),
        ...(index.chunkDirectory ? [octreeChunkInfoPath(catalog.family, catalog.name, ref)] : []),
      ];
      const walk = (refs: readonly OctreeChunkRef[]) => {
        for (const ref of refs) {
          for (const rel of rels(ref))
            uploads.push({ localPath: join(dataDir, rel), r2Key: `data/${rel}` });
          walk(
            readOctreeFileHeader<OctreeChunkHeader>(
              join(dataDir, octreeChunkPath(catalog.family, catalog.name, ref)),
              OCTREE_CHUNK_MAGIC,
            ).chunks,
          );
        }
      };
      walk(index.chunks);
      return uploads;
    });
}
