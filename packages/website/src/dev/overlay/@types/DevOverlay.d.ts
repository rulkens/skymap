/** The one switch for the whole dev overlay (feedback and review), and the keys only it handles. */
export type DevOverlay = {
  isOn: () => boolean;
  setOn: (next: boolean) => void;
  subscribe: (listener: (on: boolean) => void) => void;
  /** Escape goes to these in order; the first to return true has used it, and if none has, the overlay turns off. */
  onEscape: (handler: (e: KeyboardEvent) => boolean) => void;
  /** A press on the capture layer is offered to these first, by viewport point; true means one took it. */
  onPress: (handler: (x: number, y: number) => boolean) => void;
  press: (x: number, y: number) => boolean;
};
