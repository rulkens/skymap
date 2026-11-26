import type { McpmParams } from '../../@types/sim/McpmParams';

/**
 * MCPM_PARAM_KEYS — McpmParams' field list, derived from a `Record<keyof McpmParams, …>`
 * instead of a hand-spelled array: the sentinel below must cover every `McpmParams` key or TS
 * errors, so a field added to `McpmParams` is a compile error here (and, independently, at
 * ControlsPanel's keyed `PARAM_SLIDER_FIELDS`) until it's accounted for — the same
 * exhaustiveness `DEFAULT_MCPM_PARAMS` already gets for free. `buildParamsPayload`,
 * `emitTraceSidecar`'s `provenance.params`, and `importParams`'s validator all key off the
 * resulting array, so the eight fields can never drift between the sidecar and the save/load
 * preset.
 */
const MCPM_PARAM_KEY_SENTINEL: Record<keyof McpmParams, true> = {
  senseSpreadDeg: true,
  senseDistanceMpc: true,
  turnAngleDeg: true,
  moveDistanceMpc: true,
  depositValue: true,
  persistence: true,
  sharpness: true,
  normalizationFactor: true,
};

export const MCPM_PARAM_KEYS: readonly (keyof McpmParams)[] = Object.keys(
  MCPM_PARAM_KEY_SENTINEL,
) as (keyof McpmParams)[];
