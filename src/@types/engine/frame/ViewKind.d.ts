/**
 * ViewKind — what a `FrameView` renders: `'frame'` is the main view or
 * a rig view (temporal state such as star fades is theirs to advance);
 * `'capture'` is a cubemap face, one static frame with none.
 */
export type ViewKind = 'frame' | 'capture';
