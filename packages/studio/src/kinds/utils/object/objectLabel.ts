/**
 * A focus id's name and kind as the search results show them, from the same index; null for an id
 * the index does not hold (not loaded yet, or an SDSS or position id the palette never lists).
 */
import { paletteRowLabel } from '../../../../../../src/utils/palette/paletteRowLabel';
import type { PaletteRowLabel } from '../../../../../../src/@types/palette/PaletteRowLabel';
import type { ObjectIndex } from '../../../@types/kinds/ObjectIndex';

const PGC_ID = /^pgc-(\d+)$/;

export function objectLabel(id: string, index: ObjectIndex): PaletteRowLabel | null {
  const famous = index.famous.find((e) => e.id === id);
  if (famous) return paletteRowLabel({ kind: 'famous', entry: famous, score: 0 });
  const structure = index.structures.find((e) => e.id === id);
  if (structure) return paletteRowLabel({ kind: 'structure', entry: structure, score: 0 });
  const layer = index.layerRows.find((e) => e.id === id);
  if (layer) return paletteRowLabel({ kind: 'layer', entry: layer, score: 0 });
  const pgc = PGC_ID.exec(id)?.[1];
  const alias = pgc === undefined ? undefined : index.aliases.find((e) => e.pgc === Number(pgc));
  return alias ? paletteRowLabel({ kind: 'alias', entry: alias, score: 0 }) : null;
}
