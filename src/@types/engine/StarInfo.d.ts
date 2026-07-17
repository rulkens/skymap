/**
 * StarInfo — a picked survey star as a resolved focusable target, parallel to
 * `GalaxyInfo`, `StructureInfo`, and `MilkyWayInfo`.  All four are arms of the
 * FocusableTarget union and flow through the same hover / select / focus slots;
 * every dispatch table and type-guard keys on the `type` discriminant.
 *
 * Like `MilkyWayInfo` (and unlike the galaxy arm's engine-baked `GalaxyInfo`),
 * this is a small self-derived card view-model: `buildFocusable` computes it
 * purely from the stored star `SelectionRow` via the Task-1 helpers, so React
 * can build it inside a memoized selector without reaching the engine.
 *
 * SKST v1 carries no per-star identity — the bin quantises position + Gaia
 * photometry only — so the star has no name of its own; `displayName` is the
 * fixed literal 'Field star'.  The derived fields (`distancePc`, `apparentMag`,
 * `spectralClass`) are what the card actually shows; the raw `absMag` / `bpRp`
 * are kept so the card can present the catalogued values alongside the derived
 * ones, and `x`/`y`/`z` (heliocentric Mpc) feed the camera framing.
 */
export type StarInfo = {
  /** Union tag — what every FocusableTarget table / guard keys on. */
  readonly type: 'star';
  /** The bin-stable global star-record index, for `refOf` / URL round-trip. */
  readonly index: number;
  /** Headline shown in the InfoCard — 'Field star' (SKST v1 carries no identity). */
  readonly displayName: string;
  /** Heliocentric world position (Mpc), for camera framing. */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Distance from the Sun in parsecs (length of positionMpc, Mpc → pc). */
  readonly distancePc: number;
  /** Catalogued absolute magnitude. */
  readonly absMag: number;
  /** Apparent magnitude at `distancePc` — apparentMagnitudeFromAbs(absMag, distancePc). */
  readonly apparentMag: number;
  /** Catalogued Gaia BP−RP colour index. */
  readonly bpRp: number;
  /** Rough spectral class binned from `bpRp` — spectralClassFromBpRp(bpRp). */
  readonly spectralClass: string;
};
