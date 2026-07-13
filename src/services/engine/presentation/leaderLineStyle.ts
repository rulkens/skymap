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
 * measured in screen space. Floored via `MIN_LABEL_CLEARANCE_PX` so tiny
 * subjects still get a caption that clears them.
 */
export const LEADER_LIFT_FACTOR = 1.5;

/**
 * Guaranteed minimum screen distance, in pixels, between a caption's measured
 * GLYPH-INK BOTTOM and the dot it labels. A barely-resolved subject (M110
 * near the famous emission gate, a sub-pixel star at solar-system zoom) gets
 * a proportional lift of single-digit pixels — without this guarantee the
 * caption would sit on top of the subject and its close-approach thumbnail.
 *
 * The guarantee holds for the INK, not the label anchor: the anchor is an
 * alignment artifact. A baseline-aligned caption keeps its ink bottom only a
 * descender below the anchor, but a TOP-aligned caption (the scene-body
 * sun/moon stagger) hangs its ENTIRE glyph block below — an anchor-only
 * floor would let the text swallow the whole lift, cover the dot, and
 * (through the derived line height going ≤ 0) suppress its own leader line.
 * `liftedLabelPlacement` therefore floors the anchor lift at this value AND
 * raises it further by the exact deficit whenever the measured ink bottom
 * would come within this clearance of the dot.
 *
 * Distinct from the DELETED line-length floor, which fought the proportional
 * lift by inflating the line; the line's visibility stays purely the
 * derived-height > 0 rule. (Under the clearance guarantee the derived line
 * height is `clearance − padding` at minimum — a short pointer under a clear
 * caption.)
 */
export const MIN_LABEL_CLEARANCE_PX = 28;

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

/**
 * TUNING KNOB: the visible screen gap, in pixels, between a foreground body's
 * EDGE and its connector line's BOTTOM. The foreground caption layer lifts
 * each connector's bottom by the body's apparent RADIUS plus this gap
 * (`subjectSizePx / 2 + LEADER_LINE_BOTTOM_GAP_PX`), so an unresolved point
 * keeps a small clear space under the line, and a resolved sphere keeps the
 * SAME clear space above its top rim — the offset tracks the body's apparent
 * size automatically. The famous / Milky-Way producers pass no bottom lift
 * (their line starts at the dot itself), so this knob only moves the
 * foreground bodies' connectors.
 */
export const LEADER_LINE_BOTTOM_GAP_PX = 4;
