import { OCTREE_FAMILIES } from '../../../src/data/octree/octreeFamilies';
import type { DataFamily } from '../@types/DataFamily';
import type { OctreeCatalog } from '../@types/OctreeCatalog';

/** The index row and the chunk row for one catalog; chunks name themselves by content hash, so they travel bulk. */
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
  ];
}
