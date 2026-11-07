/**
 * StylizeStepSpec — the frame's last line: an alternate look (the antique
 * atlas) re-draws the tone-mapped scene and its overlays onto the swap chain.
 * Emits nothing while no look is on, and the swap lines then stay on `swap`.
 */
export type StylizeStepSpec = {
  readonly kind: 'stylize';
  /** The tone-mapped scene. */
  readonly source: string;
  /** The captions and rings, premultiplied over transparent. */
  readonly overlay: string;
};
