import type { CatalogPoints } from '../../@types/catalog/CatalogPoints';

/**
 * concatCatalogPoints — joins point sets end to end, sources in first-seen order.
 * A lone non-empty part is handed back uncopied: a loaded file can be 400 MB.
 */
export function concatCatalogPoints(parts: readonly CatalogPoints[]): CatalogPoints {
  const sources = [...new Set(parts.flatMap((part) => part.sources))];
  const filled = parts.filter((part) => part.count > 0);
  if (filled.length === 1) return { ...filled[0]!, sources };

  let count = 0;
  for (const part of filled) count += part.count;
  const positions = new Float32Array(count * 3);
  const weight = new Float32Array(count);
  let offset = 0;
  for (const part of filled) {
    positions.set(part.positions, offset * 3);
    weight.set(part.weight, offset);
    offset += part.count;
  }
  return { positions, weight, count, sources };
}
