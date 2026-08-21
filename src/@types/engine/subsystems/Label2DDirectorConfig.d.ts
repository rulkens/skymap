import type { ReadyFrameContext } from '../frame/ReadyFrameContext';
import type { Label2DProjection } from '../../rendering/Label2DProjection';
import type { Label2DDeclutterPolicy } from './Label2DDeclutterPolicy';
import type { Label2DEnvelopePolicy } from './Label2DEnvelopePolicy';
import type { Label2DLiftPolicy } from './Label2DLiftPolicy';

/**
 * Data-driven parameterization for `createLabel2DDirector` — one literal per
 * director instance (COSMO today; NEAR0 once its arms land). Declutter and
 * envelope are tagged unions so a director's behaviour is picked by `mode`
 * rather than by which factory function got called.
 */
export type Label2DDirectorConfig = {
  readonly id: string;
  /** Resolves this frame's projection for the director's slab. Memoised per ctx. */
  readonly project: (ctx: ReadyFrameContext) => Label2DProjection;
  readonly declutter: Label2DDeclutterPolicy;
  readonly envelope: Label2DEnvelopePolicy;
  /** `null` STATES the stance — not optional, so a third instance must decide. */
  readonly lift: Label2DLiftPolicy | null;
};
