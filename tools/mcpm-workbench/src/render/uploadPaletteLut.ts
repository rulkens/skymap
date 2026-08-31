/**
 * uploadPaletteLut — the runtime's scalar-field palette as a GPU texture.
 *
 * An N x 1 2D texture, not a texture_1d: WGSL defines no `textureSampleLevel`
 * overload for 1D textures, so the explicit-LOD lookup the raymarch needs (its
 * palette read sits in non-uniform control flow) only compiles portably against
 * a 2D sampler. Mirrors `volumeFieldRenderer`'s palette texture exactly, so the
 * workbench and the app show the same named ramp.
 *
 * The LUT's alpha channel is uploaded but never read — the raymarch takes its
 * opacity from Polyphorm's `opticalThickness * r` instead (spec §15 decision 6).
 */
import type { ScalarFieldPaletteId } from '../../../../src/@types/data/volume/ScalarFieldPaletteId';
import { buildPaletteLut, PALETTE_LUT_SIZE } from '../../../../src/data/volume/scalarFieldPalettes';

export function uploadPaletteLut(device: GPUDevice, id: ScalarFieldPaletteId): GPUTexture {
  const texture = device.createTexture({
    label: `mcpm-palette-${id}`,
    size: { width: PALETTE_LUT_SIZE, height: 1, depthOrArrayLayers: 1 },
    format: 'rgba8unorm',
    dimension: '2d',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture },
    buildPaletteLut(id),
    { bytesPerRow: PALETTE_LUT_SIZE * 4 },
    { width: PALETTE_LUT_SIZE, height: 1, depthOrArrayLayers: 1 },
  );
  return texture;
}
