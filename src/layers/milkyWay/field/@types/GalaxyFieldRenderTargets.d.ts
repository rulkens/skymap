import type { FieldTarget } from './FieldTarget';
import type { FieldTargetId } from './FieldTargetId';

/**
 * Render targets the HOST allocates and owns, one per `FieldTargetId`.
 * `dustView` is the debug JWST view's target; absent, its pass never encodes.
 */
export type GalaxyFieldRenderTargets = Readonly<Record<FieldTargetId, FieldTarget>> & {
  readonly dustView?: FieldTarget;
};
