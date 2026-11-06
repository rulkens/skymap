import type { BodyInfo } from '../../../@types/engine/BodyInfo';
import type { BodyRef } from '../../../@types/engine/selection/BodyRef';

export type BodyTarget = BodyInfo & { readonly ref: BodyRef };
