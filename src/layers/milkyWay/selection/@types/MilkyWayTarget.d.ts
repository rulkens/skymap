import type { MilkyWayInfo } from '../../../../@types/engine/MilkyWayInfo';
import type { MilkyWayRef } from './MilkyWayRef';

export type MilkyWayTarget = MilkyWayInfo & { readonly ref: MilkyWayRef };
