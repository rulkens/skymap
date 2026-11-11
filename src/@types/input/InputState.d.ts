import type { PendingStep } from './PendingStep';
import type { PickRequest } from './PickRequest';
import type { InputSourceId } from './InputSourceId';

export type InputState = {
  readonly sources: Readonly<Record<InputSourceId, { readonly aspect: number }>>;
  readonly owner: InputSourceId | null;
  readonly pending: readonly PendingStep[];
  readonly pick: { readonly hover: PickRequest | null; readonly select: PickRequest | null };
  readonly pickSeq: number;
};
