import type { OverlayMode } from './OverlayMode';

/** The one switch for the whole dev overlay (feedback and review), and the keys only it handles. */
export type DevOverlay = {
  isOn: () => boolean;
  setOn: (next: boolean) => void;
  /** What the pointer does while the overlay is on; kept across reloads. */
  mode: () => OverlayMode;
  setMode: (next: OverlayMode) => void;
  /** Returns the way to stop listening (to a change of on or mode). */
  subscribe: (listener: () => void) => () => void;
  /** Escape goes to these newest first; the first to return true has used it. */
  onEscape: (handler: (e: KeyboardEvent) => boolean) => () => void;
  /** Offers Escape to the handlers; false when none used it, and the overlay then turns off. */
  escape: (e: KeyboardEvent) => boolean;
  /** A press on the capture layer is offered to these first, by viewport point; true means one took it. */
  onPress: (handler: (x: number, y: number) => boolean) => () => void;
  press: (x: number, y: number) => boolean;
};
