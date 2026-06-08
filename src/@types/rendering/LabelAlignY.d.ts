/**
 * Vertical alignment of a label relative to its world anchor.
 *
 *   `'baseline'` (default) — pen anchor sits on the text baseline.
 *                            This is the legacy behaviour every caller
 *                            uses if `alignY` is omitted, and matches
 *                            the typographic convention every Y offset
 *                            in the atlas is measured against.
 *   `'center'`             — visual centre of the glyph bounding box
 *                            sits on the anchor.  Used by structure labels
 *                            (cluster / supercluster / void) that
 *                            anchor on a ring centre and want the
 *                            label text symmetrically straddled
 *                            around the centre rather than hanging
 *                            below it.
 *   `'top'`                — top edge of the highest glyph sits on
 *                            the anchor; text extends downward.
 *   `'bottom'`             — bottom edge of the lowest glyph sits on
 *                            the anchor; text extends upward.
 *
 * The shift is computed from the actual glyph bbox of the laid-out
 * string (not a font-wide cap-height constant) so labels containing
 * only uppercase, only digits, mixed punctuation, etc. all centre on
 * the visible ink rather than on a font-default line box that may
 * include space the actual glyphs don't occupy.
 */
export type LabelAlignY = 'baseline' | 'center' | 'top' | 'bottom';
