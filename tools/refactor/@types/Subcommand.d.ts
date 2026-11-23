import type { LegacyInput } from './LegacyInput';
import type { RunInput } from './RunInput';

export type Subcommand = {
  readonly name: string;
  readonly usage: string;
} & (
  | { readonly kind: 'legacy'; readonly run: (input: LegacyInput) => Promise<void> }
  | { readonly kind: 'report'; readonly report: (run: RunInput) => string }
);
