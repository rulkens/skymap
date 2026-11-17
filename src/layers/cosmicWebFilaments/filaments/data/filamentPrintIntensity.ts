/** The print's stroke strength: one strip lands at ~0.01 alpha (0.12 × this), so a
 * lone strip barely inks, a spine's 50-100 overlapping strips reach 0.4-0.7, and
 * 1 - 0.99^N stays under the plate's trail level (0.9) up to ~200 strips. */
export const FILAMENT_PRINT_INTENSITY = 0.09;
