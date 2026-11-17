/**
 * buildProbeSphereMesh — the probe sphere as a `MeshAsset`, built in the browser: a UV sphere
 * and three 1×1 maps, so no baked asset ships. The maps are neutral (white, ORM all 1, flat
 * normal), which leaves colour, metallic and roughness wholly to the material factors.
 */

import type { MeshAsset } from '../../../../@types/data/mesh/MeshAsset';
import { uvSphereGeometry } from '../../../../utils/meshBodies/uvSphereGeometry';
import { PROBE_SPHERE_RADIUS_M } from '../data/probeSphereRadiusM';

// Enough to keep a mirror's silhouette and its reflected horizon smooth at full screen.
const SEGMENTS = 64;
const RINGS = 32;

function solidBitmap(rgba: readonly number[]): Promise<ImageBitmap> {
  const pixel = new ImageData(new Uint8ClampedArray(rgba), 1, 1);
  return createImageBitmap(pixel, { colorSpaceConversion: 'none' });
}

export async function buildProbeSphereMesh(): Promise<MeshAsset> {
  const [albedo, metalRough, normalMap] = await Promise.all([
    solidBitmap([255, 255, 255, 255]),
    solidBitmap([255, 255, 255, 255]),
    solidBitmap([128, 128, 255, 255]),
  ]);
  return {
    ...uvSphereGeometry(PROBE_SPHERE_RADIUS_M, SEGMENTS, RINGS),
    albedo,
    metalRough,
    normalMap,
  };
}
