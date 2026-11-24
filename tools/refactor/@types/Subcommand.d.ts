import type { PlanResult } from '../../@types/refactor/PlanResult';
import type { LegacyInput } from './LegacyInput';
import type { RunInput } from './RunInput';

export type Subcommand = {
  readonly name: string;
  readonly usage: string;
  readonly arity: number; // positionals the row needs
} & (
  | { readonly kind: 'legacy'; readonly run: (input: LegacyInput) => Promise<void> }
  | { readonly kind: 'report'; readonly report: (run: RunInput) => string }
  | { readonly kind: 'plan'; readonly plan: (run: RunInput) => PlanResult }
);
