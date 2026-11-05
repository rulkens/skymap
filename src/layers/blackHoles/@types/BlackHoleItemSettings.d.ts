/**
 * BlackHoleItemSettings — one black hole's row in `settings.blackHoles.items`.
 * Label only: the lens and marker are gated by the scale band, never a toggle,
 * so a visibility bit here would have no reader.
 */
export type BlackHoleItemSettings = {
  readonly labelEnabled: boolean;
};
