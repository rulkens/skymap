import { OUTPUT_PROJECTION_BYTES } from '../../services/gpu/lib/outputProjectionUniform';

/** `struct Uniforms` in labels/io.wesl, byte offsets; `labelUniforms.parity` holds them. */
export const LABEL_UNIFORM_OFFSETS = {
  output: 0,
  viewFromSlab: OUTPUT_PROJECTION_BYTES,
  nearClipMpc: OUTPUT_PROJECTION_BYTES + 64,
} as const;
