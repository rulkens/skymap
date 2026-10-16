import type { PendingStep } from './PendingStep';
import type { PickRequest } from './PickRequest';
import type { SourceId } from './SourceId';

export type InputState = {
  readonly sources: Readonly<Record<SourceId, { readonly aspect: number }>>;
  readonly owner: SourceId | null;
  readonly pending: readonly PendingStep[];
  readonly pick: { readonly hover: PickRequest | null; readonly select: PickRequest | null };
  readonly pickSeq: number;
};
