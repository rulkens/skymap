/**
 * EngineThumbnailsHandle — galaxy-thumbnail render pass toggle.
 *
 * One method.  Disabling skips the whole per-frame thumbnail block
 * (selection, fetch, draw) so it's a meaningful GPU-time saver.
 */
export type EngineThumbnailsHandle = {
  /** Toggle the galaxy-thumbnail render pass on/off. */
  setEnabled: (enabled: boolean) => void;
};
