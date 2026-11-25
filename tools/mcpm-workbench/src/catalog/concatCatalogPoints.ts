import type { CatalogPoints } from '../../@types/catalog/CatalogPoints';

/** concatCatalogPoints — joins point sets end to end, sources in first-seen order. */
export function concatCatalogPoints(parts: readonly CatalogPoints[]): CatalogPoints {
  let count = 0;
  for (const part of parts) count += part.count;

  const positions = new Float32Array(count * 3);
  const weight = new Float32Array(count);
  let offset = 0;
  for (const part of parts) {
    positions.set(part.positions, offset * 3);
    weight.set(part.weight, offset);
    offset += part.count;
  }

  const sources = [...new Set(parts.flatMap((part) => part.sources))];
  return { positions, weight, count, sources };
}
