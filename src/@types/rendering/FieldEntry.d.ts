/** FieldEntry — the `VolumeFieldRenderer`'s record per uploaded field. Tunables are read per frame
 *  through `settingsOf`, never mirrored here. */

import type { Mat4 } from 'wgpu-matrix';

import type { ScalarFieldPaletteId } from '../data/volume/ScalarFieldPaletteId';
import type { GpuVolume } from './GpuVolume';

export type FieldEntry = {
  /** From `upload`'s statics; see `VolumeFieldDefaults`. */
  contrastCenter: number;
  envelopeInner: number;
  envelopeOuter: number;
  /** What `paletteTexture` holds, not the setting: `draw` re-uploads the LUT when they differ. */
  residentPaletteId: ScalarFieldPaletteId;
  modelMatrix: Mat4;
  invModelMatrix: Mat4;
  volume: GpuVolume;
  paletteTexture: GPUTexture;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  /** FadeUniforms, 16 bytes: opacity f32 + 12 bytes pad. */
  fadeBuffer: GPUBuffer;
  fadeBindGroup: GPUBindGroup;
};
