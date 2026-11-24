import type { PlanResult } from '../../@types/refactor/PlanResult';
import type { LegacyInput } from './LegacyInput';
import type { PropRun } from './PropRun';
import type { SymbolRun } from './SymbolRun';

type Common = {
  readonly name: string;
  readonly usage: string;
  readonly arity: number; // positionals the row needs
};

/** `accepts` is the address kind the row takes; the driver refuses the other before any query. */
export type Subcommand = Common &
  (
    | ({ readonly accepts: 'symbol' } & (
        | { readonly kind: 'legacy'; readonly run: (input: LegacyInput) => Promise<void> }
        | { readonly kind: 'report'; readonly report: (run: SymbolRun) => string }
        | { readonly kind: 'plan'; readonly plan: (run: SymbolRun) => PlanResult }
      ))
    | ({ readonly accepts: 'prop' } & (
        | { readonly kind: 'report'; readonly report: (run: PropRun) => string }
        | { readonly kind: 'plan'; readonly plan: (run: PropRun) => PlanResult }
      ))
  );
