/**
 * ScalarFieldFrameKind — the coordinate frame a `ScalarCube` lives in.
 *
 * The renderer maps this to world space at draw time via a per-frame
 * rotation (supergalactic-cartesian / equatorial-cartesian / galactic).
 * Listed as a string union so it can be encoded as a 1-byte enum tag
 * in the SCFD binary header without losing the human-readable label
 * at the JS level.
 */
export type ScalarFieldFrameKind = 'supergalactic-cartesian' | 'equatorial-cartesian' | 'galactic';
