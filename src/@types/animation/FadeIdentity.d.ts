import type { VisibilityAddress } from './VisibilityAddress';

/** One fade controller: an entry's address, plus the item for a per-item entry. */
export type FadeIdentity = {
  readonly address: VisibilityAddress;
  readonly item?: string;
};
