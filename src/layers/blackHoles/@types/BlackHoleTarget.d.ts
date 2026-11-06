import type { BlackHoleInfo } from '../../../@types/engine/BlackHoleInfo';
import type { BlackHoleRef } from './BlackHoleRef';

export type BlackHoleTarget = BlackHoleInfo & { readonly ref: BlackHoleRef };
