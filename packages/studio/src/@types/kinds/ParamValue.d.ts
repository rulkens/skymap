import type { SettingsAction } from '../../../../../src/compositions/@types/SettingsAction';

/** A subject param's stored value as the inspector edits it; undefined removes the param. */
export type ParamValue = number | string | boolean | readonly string[] | SettingsAction | undefined;
