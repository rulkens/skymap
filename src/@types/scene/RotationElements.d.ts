/**
 * RotationElements — how one body's facing is modelled, as a tagged union: the
 * IAU/WGCCRE J2000 mean elements (`iau-pole`, whose discriminant is optional
 * because the authored rows predate the union), a probe's boresight aimed at
 * another body (`lookAt`), or a lander pinned to its host's local horizon
 * (`surfaceLocked`). `OrbitalElements` places a body; this aims it, and a body
 * with no row is rotation-invariant. Degrees throughout; each arm bakes to a
 * `Mat3` through its own util in `src/utils/orbit/`.
 */

export type RotationElements =
  | {
      readonly kind?: 'iau-pole';
      readonly id: string;
      /** IAU north-pole right ascension α₀, in degrees at J2000 (the α̇ rate is dropped). */
      readonly poleRaDeg: number;
      /** IAU north-pole declination δ₀, in degrees at J2000 (the δ̇ rate is dropped). */
      readonly poleDecDeg: number;
      /** Prime meridian W₀ at the J2000 epoch, in degrees; the live W is W₀ + Ẇ·d. */
      readonly primeMeridianDeg: number;
      /** Spin rate Ẇ, degrees per day — advances the prime meridian from W₀. */
      readonly spinRateDegPerDay: number;
    }
  | {
      readonly kind: 'lookAt';
      readonly id: string;
      /** The body the boresight (+X) tracks; it must be positioned before this row resolves. */
      readonly targetId: string;
    }
  | {
      readonly kind: 'surfaceLocked';
      readonly id: string;
      /** Bearing of forward (+X), degrees from local north toward local east. */
      readonly headingDeg: number;
    };
