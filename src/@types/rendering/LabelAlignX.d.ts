/**
 * Horizontal alignment of the rendered text relative to the label's world anchor. A number is
 * the share of each line's width set left of the anchor (0 left, 0.5 centre, 1 right): the
 * antique title slides between a name's resting alignment and centred as it grows.
 */
export type LabelAlignX = 'left' | 'center' | 'right' | number;
