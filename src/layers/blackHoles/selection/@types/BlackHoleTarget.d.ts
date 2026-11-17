import type { BlackHoleInfo } from './BlackHoleInfo';
import type { BlackHoleRef } from './BlackHoleRef';

export type BlackHoleTarget = BlackHoleInfo & { readonly ref: BlackHoleRef };
