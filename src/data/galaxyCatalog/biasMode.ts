/**
 * BiasMode — runtime selector for the point pass's survey-bias correction.
 *
 *   - `None` (0): render every galaxy unchanged.
 *   - `VolumeLimited` (1): discard galaxies fainter than `absMagLimit`.
 *   - `AngularReweight` (2): multiply by the build-time HEALPix angular weight
 *     (the tier build's `bakeBiasWeights`), which flattens GLADE's pencil-beam jets.
 *
 * The values are a GPU contract: `points/vertexBody.wesl` compares `u.biasMode`
 * against literal `1u` / `2u`, and the type mirror lives in `BiasMode.d.ts`.
 */
export const BiasMode = {
  None: 0,
  VolumeLimited: 1,
  AngularReweight: 2,
} as const;
