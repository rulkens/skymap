/**
 * CSS px (times pxScale) between a leader's top and its label's ink bottom. The shader derives the
 * line top from the text, so the gap holds at every lift; no room left means no line.
 * `labels/vertex.wesl` carries a copy, held by `labelRecord.parity`.
 */
export const LEADER_LINE_PADDING_PX = 3;
