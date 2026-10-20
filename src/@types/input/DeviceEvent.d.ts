import type { Modifiers } from './Modifiers';
import type { UnitPoint } from './UnitPoint';

/** One raw event from an input source, positions already in unit space; `t` is the source's clock in ms. */
export type DeviceEvent = { readonly t: number } & (
  | {
      readonly kind: 'down' | 'move' | 'up' | 'cancel';
      readonly pointer: number;
      readonly pointerType: 'mouse' | 'touch' | 'pen';
      readonly button: 0 | 1 | 2;
      readonly at: UnitPoint;
      readonly mods: Modifiers;
    }
  | {
      readonly kind: 'wheel';
      readonly ratio: number;
      readonly at: UnitPoint;
      readonly mods: Modifiers;
    }
  | { readonly kind: 'leave' }
  | { readonly kind: 'resize'; readonly widthPx: number; readonly heightPx: number }
);
