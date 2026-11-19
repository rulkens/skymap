import { OUTPUT_PROJECTION_BYTES } from '../../services/gpu/lib/outputProjectionUniform';

/** `struct RecordUniforms` in labels/io.wesl, byte offsets; `labelRecord.parity` holds them. */
export const LABEL_RECORD_UNIFORM_OFFSETS = {
  output: 0,
  hoveredPick: OUTPUT_PROJECTION_BYTES,
  selectedPick: OUTPUT_PROJECTION_BYTES + 4,
  minTextPx: OUTPUT_PROJECTION_BYTES + 8,
  maxTextPx: OUTPUT_PROJECTION_BYTES + 12,
  emRetune: OUTPUT_PROJECTION_BYTES + 16,
  hoveredWhiten: OUTPUT_PROJECTION_BYTES + 20,
  selectedWhiten: OUTPUT_PROJECTION_BYTES + 24,
} as const;

export const LABEL_RECORD_UNIFORM_BYTES = OUTPUT_PROJECTION_BYTES + 32;
