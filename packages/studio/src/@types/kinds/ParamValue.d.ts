import type { SettingsAction } from '../../../../../src/compositions/@types/SettingsAction';
import type { Vec3 } from '../../../../../src/@types/math/Vec3';

/** A subject param's stored value as the inspector edits it; undefined removes the param. */
export type ParamValue =
  | number
  | string
  | boolean
  | readonly string[]
  | Vec3
  | SettingsAction
  | undefined;
