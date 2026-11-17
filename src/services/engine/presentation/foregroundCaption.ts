/**
 * ForegroundCaption — the caption shape the near-field `labelsNearPass`
 * draws.
 *
 * A `Label` whose tint, em height, and pixel clamps are ALWAYS authored —
 * unlike the general `Label`, where those fields are optional and fall back to
 * renderer defaults — carrying the declutter `priority` its owning Layer
 * authors. Narrowing the required fields
 * here states that guarantee once at the type, so the layer reads them
 * without a per-field `?? default` that would silently mask a caption built without its colour or
 * clamps.
 *
 * The NEAR0 caption producers build this shape and the director merges them
 * into ONE declutter + envelope pass, reading `priority`, `worldPos` and the
 * required fields off every entry without caring which producer made it.
 */

import type { Label2D } from '../../../@types/rendering/Label2D';
import type { FadeBand } from '../../../@types/math/FadeBand';

export type ForegroundCaption = Label2D &
  Required<Pick<Label2D, 'color' | 'worldEmMpc' | 'minPixelSize' | 'maxPixelSize'>> & {
    /** Declutter priority: higher wins a screen collision, whatever the size. */
    readonly priority: number;
    /** The body this caption names, where the producer knows it (mesh bodies); read by the
     *  craft-emphasis dim, which must not parse it back out of the `sceneBody-` id. */
    readonly bodyId?: string;
    /** Per-caption approach reveal, in Mpc of anchor-to-camera distance,
     *  multiplied on top of the handed label value. For a fade that differs per
     *  caption within one label item, which no entry band can express. */
    readonly revealBand?: FadeBand;
  };
