import type { McpmParams } from '../../@types/sim/McpmParams';
import { MCPM_PARAM_KEYS } from './mcpmParamKeys.constant';

/** A plain-object copy carrying exactly MCPM_PARAM_KEYS — the one place either
 * consumer spells out the params object. */
export function buildParamsPayload(params: McpmParams): McpmParams {
  const payload = {} as Record<keyof McpmParams, number>;
  for (const key of MCPM_PARAM_KEYS) payload[key] = params[key];
  return payload as McpmParams;
}
