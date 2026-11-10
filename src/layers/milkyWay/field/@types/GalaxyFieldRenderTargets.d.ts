import type { FieldTarget } from './FieldTarget';
import type { FieldTargetId } from './FieldTargetId';

/**
 * Render targets the HOST allocates and owns, one per `FieldTargetId`.
 * `dustView` is the debug JWST view's target, `extras` the background
 * extras'; absent, their passes never encode (the app has neither).
 */
export type GalaxyFieldRenderTargets = Readonly<
  Record<Exclude<FieldTargetId, 'extras'>, FieldTarget>
> & {
  readonly extras?: FieldTarget;
  readonly dustView?: FieldTarget;
};
