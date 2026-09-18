/**
 * Thin wrapper over xatlas-wasm's UV repack: source UVs (0..1) become one packed atlas at a
 * given scale. The option landmines below are each a throw or a guard, because xatlas is silent
 * about the ways this can go wrong (spike history in the design doc).
 */
import createXAtlas from 'xatlas-wasm';

import type { PackedAtlas } from '../@types/PackedAtlas';

/** Keep in step with package.json — this string is stamped into asset provenance. */
export const XATLAS_WASM_VERSION = '0.1.3';

/** `null` ⇔ the charts overflowed into a second atlas: a failed scale attempt, not an error. */
export async function packCharts(
  uvs: Float32Array, // SOURCE uvs, 0..1, 2 per vertex
  indices: Uint32Array,
  sourceSizePx: number,
  destSizePx: number,
  scale: number,
): Promise<PackedAtlas | null> {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`packCharts: scale must be finite and > 0, got ${scale}`);
  }

  // Source texel units, never 0–1: xatlas drops faces under its area epsilon at 0–1 scale.
  const texelUvs = new Float32Array(uvs.length);
  for (let i = 0; i < uvs.length; i++) texelUvs[i] = uvs[i]! * sourceSizePx;

  const X = await createXAtlas();
  const atlas = X.createAtlas();
  try {
    const addErr = atlas.addUvMesh({ uvs: texelUvs, indices });
    if (addErr !== X.AddMeshError.Success) {
      throw new Error(`packCharts: addUvMesh failed: ${X.addMeshErrorString(addErr)}`);
    }

    atlas.computeCharts({});
    atlas.packCharts({
      resolution: destSizePx,
      texelsPerUnit: scale, // its default (0) ignores `resolution` and picks its own scale
      padding: 2,
      bilinear: true,
      rotateChartsToAxis: false, // true (its default) rotates charts by arbitrary angles — blur
      rotateCharts: true,
    });

    if (atlas.atlasCount !== 1) return null; // silent overflow otherwise; half the charts land nowhere

    const mesh = atlas.getMesh(0);
    if (mesh.indices.length !== indices.length) {
      throw new Error(
        `packCharts: xatlas dropped faces — ${mesh.indices.length} output indices, ${indices.length} input`,
      );
    }

    return {
      chartCount: mesh.chartCount,
      vertices: mesh.vertices.map((v) => ({
        xref: v.xref,
        uvPx: v.uv,
        chartIndex: v.chartIndex,
        atlasIndex: v.atlasIndex,
      })),
      indices: mesh.indices,
    };
  } finally {
    atlas.destroy();
  }
}
