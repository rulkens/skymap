import type { RenderLight } from './RenderLight';
import type { SunMode } from './SunMode';

/** The manual sun and the lighting preview are bench-only; neither is saved. */
export type SunState = {
  readonly sunMode: SunMode;
  readonly manualAzDeg: number;
  readonly manualStrength: number;
  readonly lightOn: boolean;
  readonly light: RenderLight;
};
