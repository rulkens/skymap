import type { CraftInfo } from '../../../@types/engine/CraftInfo';
import type { CraftRef } from './CraftRef';

export type CraftTarget = CraftInfo & { readonly ref: CraftRef };
