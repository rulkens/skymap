import { OCTREE_FAMILIES } from '../../../src/data/octree/octreeFamilies';
import type { DataFamily } from '../@types/DataFamily';
import type { OctreeCatalog } from '../@types/OctreeCatalog';

/**
 * The index, chunk and info rows for one catalog; chunks name themselves by content hash, so they travel bulk.
 * A catalog without info objects (stars) simply has no files for the three info rows.
 */
export function octreeDataFamilies({ family, name }: OctreeCatalog): readonly DataFamily[] {
  const dir = OCTREE_FAMILIES[family].dataPrefix;
  const label = dir.replaceAll('/', '-');
  return [
    {
      label: `${label}-index`,
      dir,
      fileName: new RegExp(`^${name}\\.bin$`),
      transport: 'wrangler',
      gzipOnWire: true,
    },
    {
      label: `${label}-chunks`,
      dir: `${dir}/${name}`,
      fileName: /^\d+-\d+\.bin$/,
      transport: 'bulk',
      gzipOnWire: true,
    },
    {
      label: `${label}-index-info`,
      dir,
      fileName: new RegExp(`^${name}\\.info\\.bin$`),
      transport: 'wrangler',
      gzipOnWire: true,
    },
    {
      label: `${label}-shards`,
      dir,
      fileName: new RegExp(`^${name}\\.pgc-\\d+\\.bin$`),
      transport: 'wrangler',
      gzipOnWire: true,
    },
    {
      label: `${label}-chunk-info`,
      dir: `${dir}/${name}`,
      fileName: /^\d+-\d+\.info\.bin$/,
      transport: 'bulk',
      gzipOnWire: true,
    },
  ];
}
