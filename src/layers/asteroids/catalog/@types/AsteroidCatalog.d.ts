/**
 * AsteroidCatalog — `asteroids.astb` decoded: row k is minor planet k + 1 in every column. The element
 * columns are the f32 values the GPU receives, so the CPU mirror (follow, card, ring) solves from the
 * same inputs. `elementsA`/`elementsB`/`extra` are the per-row GPU basis, interleaved for one upload:
 * the heliocentric position is A·(cos E − e) + B·sin E, equatorial J2000, in AU.
 */
export type AsteroidCatalog = {
  /** The shared element epoch, JD (TT). */
  readonly epochJd: number;
  readonly count: number;
  /** AU. */
  readonly a: Float32Array;
  readonly e: Float32Array;
  /** Radians, ecliptic J2000, as are node, peri and m0. */
  readonly i: Float32Array;
  readonly node: Float32Array;
  readonly peri: Float32Array;
  /** Mean anomaly at `epochJd`. */
  readonly m0: Float32Array;
  /** 4 per row: A = a·P̂ (AU), then e. */
  readonly elementsA: Float32Array;
  /** 4 per row: B = a·√(1−e²)·Q̂ (AU), then n (rad/day). */
  readonly elementsB: Float32Array;
  /** 2 per row: M₀ bitcast from f32, then hCenti << 16 | g << 8 | flags. */
  readonly extra: Uint32Array;
  /** The stored H, (H + 5)·100; `ASTEROID_FORMAT.hNone` where MPC gives none. */
  readonly hCenti: Uint16Array;
  /** The stored G, (G + 0.5)·100. */
  readonly g: Uint8Array;
  /** The stored flags (`ASTEROID_FORMAT`) plus `ASTEROID_HIDDEN_FLAG`. */
  readonly flags: Uint8Array;
};
