import type { Label3D } from '../../rendering/Label3D';

/**
 * What a single Label3D producer wants rendered this frame. `awake` is kept
 * even though today's one producer never animates: `runFrame.ts` folds it
 * into the wake vote beside the label directors' ramps.
 */
export type Label3DProducerOutput = {
  readonly labels: readonly Label3D[];
  readonly awake: boolean;
};
