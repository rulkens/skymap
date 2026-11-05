import type { LabelItemOf } from './LabelItemOf';
import type { LabelName } from './LabelName';
import type { ShowItemOf } from './ShowItemOf';
import type { ShowKey } from './ShowKey';
import type { VisibilityAddress } from './VisibilityAddress';

/** The value core hands a consumer of address `A`: one number, or one per item for a
 * per-item entry. Distributes over a union of addresses. */
export type FadeValueOf<A extends VisibilityAddress> =
  A extends `label:${infer L extends LabelName}`
    ? [LabelItemOf<L>] extends [never]
      ? number
      : Readonly<Record<LabelItemOf<L>, number>>
    : A extends ShowKey
      ? [ShowItemOf<A>] extends [never]
        ? number
        : Readonly<Record<ShowItemOf<A>, number>>
      : never;
