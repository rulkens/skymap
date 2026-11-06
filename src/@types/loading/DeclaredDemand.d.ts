import type { NearGate } from './NearGate';
import type { Tier } from '../data/Tier';
import type { VisibilityAddress } from '../animation/VisibilityAddress';

/** The object form of `AssetDemand`: what the row draws, which tiers ship it, how near it loads. */
export type DeclaredDemand = {
  /** Omitted: the row's `gates`. An address alone means any of its items (or its own switch if itemless). */
  readonly shown?:
    | VisibilityAddress
    | { readonly address: VisibilityAddress; readonly items: readonly string[] };
  /** The label switches of `shown`'s items count as shown too. */
  readonly labelsCount?: true;
  /** Tiers that ship this file; outside them the row never demands and releases a resident copy. */
  readonly tiers?: readonly Tier[];
  readonly near?: NearGate;
  /** Lift the scale gate (never the switch or tier). `selected` reads `shown`'s entry `selects`. */
  readonly alsoWhen?: readonly ('searching' | 'selected')[];
};
