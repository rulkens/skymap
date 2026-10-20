import type { Modifiers } from './Modifiers';

/** What the binding table matches on: which button of which device, with the modifiers held. */
export type Press = {
  readonly button: 0 | 1 | 2;
  readonly pointerType: 'mouse' | 'touch' | 'pen';
} & Modifiers;
