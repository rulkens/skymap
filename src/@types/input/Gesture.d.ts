import type { Modifiers } from './Modifiers';
import type { Press } from './Press';
import type { UnitPoint } from './UnitPoint';

/** What the recognizer says a device stream means; `dx`/`dy` are fractions of the surface's width/height. */
export type Gesture =
  | { readonly kind: 'heldStart'; readonly press: Press; readonly at: UnitPoint }
  | { readonly kind: 'drag'; readonly dx: number; readonly dy: number; readonly at: UnitPoint }
  | { readonly kind: 'pinch'; readonly ratio: number }
  | { readonly kind: 'heldEnd' }
  | {
      readonly kind: 'wheel';
      readonly ratio: number;
      readonly at: UnitPoint;
      readonly mods: Modifiers;
    }
  | { readonly kind: 'hover'; readonly at: UnitPoint | null }
  | { readonly kind: 'tap'; readonly press: Press; readonly at: UnitPoint }
  | { readonly kind: 'doubleTap'; readonly press: Press; readonly at: UnitPoint };
