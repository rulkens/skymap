/**
 * OrnamentField — a cartouche's blank field, where a plate's title is set:
 * its centre and half-axes normalised to the unpadded sprite, an oval or a ruled rect.
 */
export type OrnamentField = {
  readonly shape: 'ellipse' | 'rect';
  readonly cx: number;
  readonly cy: number;
  readonly rx: number;
  readonly ry: number;
  /** Past this scale of the field the accent pigment's (the scrollwork's outer scrolls). */
  readonly accentScale?: number;
};
