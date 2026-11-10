import type { SettingsAction } from '../../../../../src/compositions/@types/SettingsAction';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';
import type { SelectionRefBase } from '../../../../../src/@types/engine/selection/SelectionRefBase';
import type { SplineConfig } from '../../../../../src/@types/animation/SplineConfig';
import type { PassByConfig } from '../../../../../src/@types/animation/PassByConfig';
import type { GeodesicTuning } from '../../../../../src/@types/camera/focusMotion/GeodesicTuning';

/** A subject param's stored value as the inspector edits it; undefined removes the param, null is a Focus step's none. */
export type ParamValue =
  | number
  | string
  | boolean
  | readonly string[]
  | Vec3
  | SettingsAction
  | SelectionRefBase
  | SplineConfig
  | PassByConfig
  | GeodesicTuning
  | null
  | undefined;
