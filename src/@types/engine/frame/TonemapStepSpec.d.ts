/**
 * TonemapStepSpec — an authored `FRAME_ORDER` line compressing the HDR
 * accumulation to display range. The frame's only tone-map, hence the one line
 * that carries the frame's tone curve.
 */
export type TonemapStepSpec = {
  readonly kind: 'tonemap';
  readonly source: string;
  readonly dest: string;
};
