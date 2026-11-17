/**
 * A label's lift off its subject, applied by the label shader where the
 * projection runs, so nothing here depends on the camera. The subject's
 * apparent diameter `D` (from `radiusMpc`) sets the text's height above it:
 * `labelLiftPx` is the rule, `labels/vertex.wesl` its WGSL twin. A label
 * without this field draws at its anchor.
 */

import type { Vec4 } from '../math/Vec4';

export type Label2DLift = {
  readonly radiusMpc: number;
  /** The connector up to the text; it vanishes when the text leaves it no room. */
  readonly leader?: {
    readonly widthPx: number;
    /** As drawn (not premultiplied again). Default: the label's own colour. */
    readonly color?: Vec4;
    /**
     * Where the line starts: `gapPx` above the subject's rim (the scene-body
     * captions) or above its centre (famous galaxies, the Milky Way).
     */
    readonly base: 'rim' | 'centre';
    readonly gapPx: number;
  };
};
