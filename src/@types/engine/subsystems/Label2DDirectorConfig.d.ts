import type { FrameView } from '../frame/FrameView';
import type { Label2DProjection } from '../../rendering/Label2DProjection';
import type { Label2DEnvelopePolicy } from './Label2DEnvelopePolicy';
import type { Label2DLiftPolicy } from './Label2DLiftPolicy';

/**
 * Data-driven parameterization for `createLabel2DDirector` — one literal per
 * director instance (COSMO's `COSMO_LABEL_DIRECTOR`, NEAR0's
 * `FOREGROUND_LABEL_DIRECTOR`, both in `src/data/labels/`). The envelope is a
 * tagged union so a director's behaviour is picked by `mode` rather than by
 * which factory function got called.
 */
export type Label2DDirectorConfig = {
  /** Resolves this frame's projection for the director's slab. Memoised per ctx. */
  readonly project: (ctx: FrameView) => Label2DProjection;
  /** Screen px of gap two kept captions' measured text rects must clear. */
  readonly declutterPadPx: number;
  readonly envelope: Label2DEnvelopePolicy;
  /** `null` STATES the stance — not optional, so a third instance must decide. */
  readonly lift: Label2DLiftPolicy | null;
};
