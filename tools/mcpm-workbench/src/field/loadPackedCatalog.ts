/**
 * loadPackedCatalog — parses the Polyphorm fork's packed VAC-anchor catalog:
 * a flat f32 [X, Y, Z, W] .bin plus its sidecar `_metadata.txt`, dev-only
 * drag-drop input for validating against the same run the fork produced.
 *
 * The packed `W` lands in `CatalogPoints.log10StellarMass` unchanged — not
 * a real log-mass, but the slot `deriveAgentWeights` already reads, so the
 * shared transform runs on it downstream with no forked maths (spec §9).
 */
import type { CatalogPoints } from '../../@types/CatalogPoints';

const FIELDS_PER_POINT = 4; // X, Y, Z, W
const BYTES_PER_FLOAT = 4;
const BYTES_PER_POINT = FIELDS_PER_POINT * BYTES_PER_FLOAT;

function parseMetadataField(metadataText: string, label: string): number {
  const match = new RegExp(`${label}\\s*=\\s*([-\\d.eE+]+)`).exec(metadataText);
  if (!match) throw new Error(`loadPackedCatalog: metadata is missing "${label}"`);
  return Number(match[1]);
}

/** Parses the fork's flat f32 [X, Y, Z, W] .bin plus its metadata txt. */
export function loadPackedCatalog(
  bin: ArrayBuffer,
  metadataText: string,
): { points: CatalogPoints; declaredCount: number; declaredMeanWeight: number } {
  const declaredCount = parseMetadataField(metadataText, 'Number of points');
  const declaredMeanWeight = parseMetadataField(metadataText, 'Mean weight');

  const expectedBytes = declaredCount * BYTES_PER_POINT;
  if (bin.byteLength !== expectedBytes) {
    const actualCount = bin.byteLength / BYTES_PER_POINT;
    throw new Error(
      `loadPackedCatalog: buffer holds ${actualCount} points but metadata declares ${declaredCount} — ` +
        `pair each .bin with its own _metadata.txt`,
    );
  }

  const flat = new Float32Array(bin);
  const positions = new Float32Array(declaredCount * 3);
  const log10StellarMass = new Float32Array(declaredCount);
  for (let i = 0; i < declaredCount; i++) {
    positions[3 * i] = flat[FIELDS_PER_POINT * i]!;
    positions[3 * i + 1] = flat[FIELDS_PER_POINT * i + 1]!;
    positions[3 * i + 2] = flat[FIELDS_PER_POINT * i + 2]!;
    log10StellarMass[i] = flat[FIELDS_PER_POINT * i + 3]!;
  }

  return {
    points: { positions, log10StellarMass, count: declaredCount, sources: [] },
    declaredCount,
    declaredMeanWeight,
  };
}
