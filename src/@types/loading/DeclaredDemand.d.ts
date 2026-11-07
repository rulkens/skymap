import type { NearGate } from './NearGate';
import type { SizeGate } from './SizeGate';
import type { Tier } from '../data/Tier';
import type { VisibilityAddress } from '../animation/VisibilityAddress';

/** The object form of `AssetDemand`: what the row draws, which tiers ship it, how near or large it loads. */
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
  /** With `near` too, both must load and either one releases. */
  readonly size?: SizeGate;
  /** Lift the scale gates (never the switch or tier); a selected kind `shown`'s entry `selects` always lifts. */
  readonly alsoWhen?: readonly 'searching'[];
};
