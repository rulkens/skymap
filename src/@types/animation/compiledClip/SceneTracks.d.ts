import type { VisibilityAddress } from '../VisibilityAddress';
import type { FactorSegment } from './FactorSegment';
import type { FocusStep } from './FocusStep';
import type { SceneStep } from './SceneStep';

/**
 * A compiled clip's scene, evaluated at the clip clock `t` (`sceneView`, `clipFactorAt`) rather
 * than fired. Settings writes stay one ordered list: a show/hide and a `scene` action can write
 * the same field, so they only compose in order through the settings reducer.
 */
export type SceneTracks = {
  /** show / hide / scene / frameTo, ascending atSec; equal atSec keeps written order. */
  readonly steps: readonly SceneStep[];
  /** focus() writes, ascending atSec; `ref: null` is an explicit clear. */
  readonly focus: readonly FocusStep[];
  /** fade() per address: the clip factor's segments, ascending startSec. */
  readonly factors: Readonly<Partial<Record<VisibilityAddress, readonly FactorSegment[]>>>;
};
