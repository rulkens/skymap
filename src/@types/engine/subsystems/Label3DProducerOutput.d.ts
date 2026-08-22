import type { Label3D } from '../../rendering/Label3D';

/**
 * What a single Label3D producer wants rendered this frame. `awake` mirrors
 * `Label2DProducerOutput`'s contract even though today's one producer never
 * animates — the wake fold at `runFrame.ts` needs both walkers to share a
 * shape (spec §3.2), a judgement call rather than an oversight.
 */
export type Label3DProducerOutput = {
  readonly labels: readonly Label3D[];
  readonly awake: boolean;
};
