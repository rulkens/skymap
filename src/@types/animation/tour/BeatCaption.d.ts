/**
 * BeatCaption — the on-screen text for a single tour beat, in the splash's
 * typographic register (mono kicker label + Cormorant-Garamond title + mono
 * body).
 *
 * `title` is the headline (the galaxy / cluster name). `body` is an optional
 * supporting sentence rendered as markdown (bold / italic / links) — short
 * placard prose, not an article. `position` anchors the block; it defaults to
 * `bottom-left` (the splash's own corner) and its horizontal half also sets the
 * text alignment, so authoring a right anchor flips the alignment for free.
 *
 * The caption is derived tour state, not stored: the runtime slice holds only
 * `tourId` + `beatIndex`, and selectors resolve the active beat's caption from
 * the registry. A beat with no caption sets the field to `null` on `BeatData`.
 */

import type { CaptionPosition } from './CaptionPosition';

export type BeatCaption = {
  readonly title: string;
  readonly body?: string;
  readonly position?: CaptionPosition;
};
