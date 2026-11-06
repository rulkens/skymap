import type { ZoneOfAvoidanceInfo } from '../../../../@types/engine/ZoneOfAvoidanceInfo';
import type { ZoneOfAvoidanceRef } from './ZoneOfAvoidanceRef';

export type ZoneOfAvoidanceTarget = ZoneOfAvoidanceInfo & { readonly ref: ZoneOfAvoidanceRef };
