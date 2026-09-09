/**
 * `BlackHoleRow` — static data binding for supermassive black holes in the scene.
 *
 * Built as an append-only registry holding more than one row; M87* is data (not
 * code) pending a data-driven black-hole catalog. Each row ties an identity to
 * disk-emission parameters (inner/outer radii in Schwarzschild units, inclination,
 * rotation, stochastic flicker) readable by the renderer on close approach.
 */

import type { BodyId } from './body/BodyId';

export type BlackHoleRow = {
  readonly bodyId: BodyId;
  readonly emission: {
    readonly innerRs: number; // Schwarzschild radii; inner edge of the accretion disc
    readonly outerRs: number; // Schwarzschild radii; photon ring / EHT imaging radius
    readonly inclinationRad: number; // radians; face-on view ≲30° per EHT observations
    readonly positionAngleRad: number; // radians; major-axis orientation angle (unconstrained, tuned for visual)
    readonly flickerAmp: number; // fractional brightness modulation (0..1)
    readonly flickerTimescaleS: number; // seconds; typical timescale of flicker variations
  };
};
