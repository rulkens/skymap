/**
 * loadPackedCatalog — parses the Polyphorm fork's packed VAC-anchor catalog:
 * a flat f32 [X, Y, Z, W] .bin plus its sidecar `_metadata.txt`, loaded to
 * validate against the same run the fork produced. The packed `W` lands in
 * `CatalogPoints.weight` unchanged: it is the same linear weight the built-ins
 * carry. Thrown messages are shown in the load dialog as they are.
 */
import type { CatalogPoints } from '../../../@types/catalog/CatalogPoints';

const FIELDS_PER_POINT = 4; // X, Y, Z, W
const BYTES_PER_FLOAT = 4;
const BYTES_PER_POINT = FIELDS_PER_POINT * BYTES_PER_FLOAT;
const COUNT_LABEL = 'Number of points';

export function loadPackedCatalog(bin: ArrayBuffer, metadataText: string): CatalogPoints {
  const match = new RegExp(`${COUNT_LABEL}\\s*=\\s*([-\\d.eE+]+)`).exec(metadataText);
  if (!match) throw new Error(`The _metadata.txt has no "${COUNT_LABEL}" line.`);
  const count = Number(match[1]);

  if (bin.byteLength !== count * BYTES_PER_POINT) {
    const actualCount = bin.byteLength / BYTES_PER_POINT;
    throw new Error(`The .bin holds ${actualCount} points; its _metadata.txt says ${count}.`);
  }

  const flat = new Float32Array(bin);
  const positions = new Float32Array(count * 3);
  const weight = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[3 * i] = flat[FIELDS_PER_POINT * i]!;
    positions[3 * i + 1] = flat[FIELDS_PER_POINT * i + 1]!;
    positions[3 * i + 2] = flat[FIELDS_PER_POINT * i + 2]!;
    weight[i] = flat[FIELDS_PER_POINT * i + 3]!;
  }
  return { positions, weight, count, sources: [] };
}
