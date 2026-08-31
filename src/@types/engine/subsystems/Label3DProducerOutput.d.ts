import type { Label3D } from '../../rendering/Label3D';

/**
 * What a single Label3D producer wants rendered this frame. `awake` mirrors
 * `Label2DProducerOutput`'s contract even though today's one producer never
 * animates — the wake fold at `runFrame.ts` needs both walkers to share a
 * shape (spec §3.2), a judgement call rather than an oversight.
 *
 * `labelsNear0` is a second, optional channel (default: none) for content
 * anchored at planet/body scale — the COSMO `label3DRenderer` uploads
 * `labels` as absolute world-Mpc positions in f32, which denormal-flushes at
 * that scale (THROWAWAY vrSpike landmine); those labels instead go to a
 * second NEAR0 renderer whose pass camera-rebases them each frame. Most
 * producers (e.g. the ZoA lettering) emit COSMO content only and omit this
 * field.
 */
export type Label3DProducerOutput = {
  readonly labels: readonly Label3D[];
  readonly labelsNear0?: readonly Label3D[];
  readonly awake: boolean;
};
