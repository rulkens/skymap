/**
 * CoreSettingsState — the settings clusters core owns, once each Layer's cluster
 * moved out to its own fragment; `EngineSettingsState` composes the two. A knob
 * lives under exactly one named cluster — a flat duplicate invites split-brain
 * reads/writes. Not `Readonly<>`: leaves are written by dispatched slice actions
 * and read in the per-frame loop. Boot values:
 * `state/settings/coreInitialSettings.ts`.
 */

import type { BiasMode } from '../data/galaxyCatalog/BiasMode';
import type { ToneMapCurve } from '../data/ToneMapCurve';
import type { HdrSettings } from './HdrSettings';
import type { LabelSettings } from './LabelSettings';
import type { DebugSettings } from './DebugSettings';
import type { OrientationFrameId } from '../camera/OrientationFrameId';

export type CoreSettingsState = {
  /** Which pole the camera calls "up". World positions never move: J2000 always. */
  orientation: OrientationFrameId;

  /** Vertical field of view in DEGREES; `runFrame` converts to radians once. */
  camera: {
    fovDeg: number;
  };

  tonemap: {
    exposure: number;
    curve: ToneMapCurve;
  };

  /** HDR opt-in + extended-range headroom knobs — see `HdrSettings`. */
  hdr: HdrSettings;

  /** `enabled` is read at frame-program BUILD — it changes the pass shape. */
  bloom: {
    enabled: boolean;
    strength: number;
    threshold: number;
  };

  /** The user-tunable half only; bake-derived weights bypass state entirely. */
  bias: {
    mode: BiasMode;
    absMagLimit: number;
  };

  /** Master toggle for the per-galaxy thumbnail quads drawn on close approach. */
  thumbnails: {
    enabled: boolean;
  };

  /** Cross-cutting label knobs — they MULTIPLY on top of per-layer label gates. */
  labels: LabelSettings;

  /** Developer diagnostic lenses on the rendered scene — see `DebugSettings`. */
  debug: DebugSettings;
};
