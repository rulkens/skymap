import type { PropAddress } from './PropAddress';
import type { SymbolAddress } from './SymbolAddress';

export type Target =
  | ({ readonly kind: 'symbol' } & SymbolAddress)
  | ({ readonly kind: 'prop' } & PropAddress);
