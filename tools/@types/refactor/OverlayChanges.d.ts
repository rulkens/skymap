/** Which files a fold touched, in the words the engine's `syncOverlay` wants. */
export type OverlayChanges = {
  readonly changed: readonly string[];
  readonly created: readonly string[];
  readonly deleted: readonly string[];
};
