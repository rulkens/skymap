/** What a setup change must redo in the running app; each is called at most once per save. */
export type SetupEffects = {
  placeWindows: () => void;
  rearmUpdates: () => void;
  reloadSky: () => void;
  resendRoom: () => void;
};
