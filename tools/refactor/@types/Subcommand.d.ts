import type { LegacyInput } from './LegacyInput';

export type Subcommand = {
  readonly name: string;
  readonly usage: string;
} & { readonly kind: 'legacy'; readonly run: (input: LegacyInput) => void };
