import type { FieldTarget } from './FieldTarget';
import type { AppFieldTargetId } from './AppFieldTargetId';

/**
 * Render targets the HOST allocates and owns, one per `FieldTargetId`.
 * `dustView` is the debug JWST view's target, `extras` the background
 * extras'; absent, their passes never encode (the app has neither).
 */
export type GalaxyFieldRenderTargets = Readonly<Record<AppFieldTargetId, FieldTarget>> & {
  readonly extras?: FieldTarget;
  readonly dustView?: FieldTarget;
};
