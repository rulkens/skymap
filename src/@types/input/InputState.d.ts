import type { PendingStep } from './PendingStep';
import type { PickRequest } from './PickRequest';
import type { SourceId } from './SourceId';

export type InputState = {
  /** `lastWheelMs` is the source's last zoom notch on the SOURCE's clock (`DeviceEvent.t`),
   * `−∞` before one: a remote's and the canvas's clocks never compare. */
  readonly sources: Readonly<
    Record<SourceId, { readonly aspect: number; readonly lastWheelMs: number }>
  >;
  readonly owner: SourceId | null;
  readonly pending: readonly PendingStep[];
  readonly pick: { readonly hover: PickRequest | null; readonly select: PickRequest | null };
  readonly pickSeq: number;
};
