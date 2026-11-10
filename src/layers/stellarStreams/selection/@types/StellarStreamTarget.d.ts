import type { StellarStreamRef } from './StellarStreamRef';
import type { StellarStreamSelectionRow } from './StellarStreamSelectionRow';

export type StellarStreamTarget = StellarStreamSelectionRow & { readonly ref: StellarStreamRef };
