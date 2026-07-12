/**
 * leaderLineStyle — the shared screen-space geometry constants for lifted
 * labels and their leader-line connectors (the famous-galaxy captions and the
 * Milky Way "You are here" marker — every producer that lifts a caption off a
 * dot via `liftedLabelPlacement`).
 *
 * One home, one set of numbers: both producers must agree on what "a lifted
 * label" looks like — same proportional lift, same line-to-text gap — or the
 * two label families would drift apart visually and each producer would grow
 * its own near-duplicate constant to tune. Style modules stay per-producer
 * (colours, widths, clamps differ legitimately); the LIFT GEOMETRY is
 * deliberately common.
 */

/**
 * Multiplier on the subject's APPARENT size (px) when computing the label
 * lift. 1.5× keeps the caption ~1.5 apparent-diameters above the dot at any
 * zoom — the proportion the retired world-space offsets (1.5 × physical
 * diameter for famous galaxies) produced when world +Y happened to project to
 * screen-up, now guaranteed at every camera orientation because the lift is
 * measured in screen space. Floored by `MIN_LABEL_LIFT_PX` so tiny subjects
 * still get a caption that clears them.
 */
export const LEADER_LIFT_FACTOR = 1.5;

/**
 * Floor on the LABEL's lift, in screen pixels. A barely-resolved galaxy
 * (M110 near the emission gate: a few px of apparent size) would get a
 * proportional lift of single-digit pixels — the caption would sit on top of
 * the galaxy itself and its close-approach thumbnail. This floors where the
 * TEXT sits, clearing a small thumbnail plus a breath.
 *
 * Distinct from the DELETED line-length floor, which fought the proportional
 * lift by inflating the line; the line's visibility stays purely the
 * derived-height > 0 rule. (With this floor the derived line usually has
 * positive height even for small galaxies — expected: a short pointer under
 * a clear caption.)
 */
export const MIN_LABEL_LIFT_PX = 28;

/**
 * Exact screen gap, in pixels, between the leader line's TOP and the caption
 * text's TRUE ink bottom (the measured glyph bbox, descenders included — not
 * the baseline). The line top is DERIVED from the text bottom minus this
 * padding, so the gap is structurally constant at every lift and zoom — the
 * two can never drift apart the way independently-computed "line at 75 % of
 * the lift" geometry did. When the padded top lands at or below the dot the
 * line is not emitted at all: the vanish behaviour falls out of the same
 * subtraction instead of needing a separate threshold constant.
 */
export const LEADER_LINE_PADDING_PX = 6;
