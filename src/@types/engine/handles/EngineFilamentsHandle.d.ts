/**
 * EngineFilamentsHandle — cosmic-web filament overlay controls.
 *
 * Optional asset (built by the DisPerSE pipeline via `npm run build-filaments`);
 * when missing, the method is a silent no-op.
 */
export type EngineFilamentsHandle = {
  /** Toggle the cosmic-web filament-skeleton overlay on or off. */
  setEnabled: (enabled: boolean) => void;
};
