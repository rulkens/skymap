import type { FrameView } from '../frame/FrameView';
import type { ViewRig } from '../frame/ViewRig';
import type { Label2DProjection } from '../../rendering/Label2DProjection';
import type { Label2DEnvelopePolicy } from './Label2DEnvelopePolicy';

/**
 * Data-driven parameterization for `createLabel2DDirector` — one literal per
 * director instance (COSMO's `COSMO_LABEL_DIRECTOR`, NEAR0's
 * `FOREGROUND_LABEL_DIRECTOR`, both in `src/data/labels/`). The envelope is a
 * tagged union so a director's behaviour is picked by `mode` rather than by
 * which factory function got called.
 */
export type Label2DDirectorConfig = {
  /** Resolves this frame's projection for the director's slab, through the rig's output. Memoised per ctx. */
  readonly project: (ctx: FrameView, rig: ViewRig) => Label2DProjection;
  /** Screen px of gap two kept captions' measured text rects must clear. */
  readonly declutterPadPx: number;
  /**
   * Where declutter judges a lifted label: where its text is drawn (COSMO), or
   * at its subject plus `proposedLiftPx` (NEAR0), the rule from when NEAR0
   * lifted after declutter. Kept so moving the lift to the GPU changes no
   * kept label; the label-sources work judges every label where it is drawn.
   */
  readonly declutterLift: 'drawn' | 'proposed';
  readonly envelope: Label2DEnvelopePolicy;
};
