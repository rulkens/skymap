/**
 * EngineFilamentsHandle — cosmic-web filament overlay controls.
 *
 * Optional asset (built by the DisPerSE pipeline via `npm run build-filaments`);
 * when missing, both methods are silent no-ops.  Intensity is multiplied
 * into the fragment-stage's pre-multiplied alpha so callers can dim the
 * overlay against the bright HDR catalogue.
 */
export type EngineFilamentsHandle = {
  /** Toggle the cosmic-web filament-skeleton overlay on or off. */
  setEnabled: (enabled: boolean) => void;
  /** Set the filament-overlay intensity scale, in [0, 1]. */
  setIntensity: (value: number) => void;
};
