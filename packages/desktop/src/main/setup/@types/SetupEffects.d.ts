/** What a stored setup change must redo in the running app; each is called at most once per save. */
export type SetupEffects = {
  placeWindows: () => void;
  rearmUpdates: () => void;
  /** Drops the test grid (it carries the old mode's art) and reloads a running sky. */
  modeChanged: () => void;
  /** Only the address the QR names moves; the code and host stay. */
  networkChanged: () => void;
  autostartChanged: (on: boolean) => void;
};
