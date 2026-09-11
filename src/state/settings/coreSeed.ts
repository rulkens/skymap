/**
 * coreSeed — builds the settings clusters core still owns, at boot values; a
 * factory (not a shared constant) so each call — e.g. a fresh engine in a
 * second browser tab — gets its own objects, never one aliased seed both
 * mutate through Immer. Shrinks as clusters move out to the Layer fragments
 * composed on top of it.
 */

import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_BIAS_MODE,
  DEFAULT_FOV_DEG,
  DEFAULT_EXPOSURE,
  DEFAULT_HDR_ENABLED,
  DEFAULT_HDR_KNEE,
  DEFAULT_HDR_HEADROOM,
  DEFAULT_BLOOM_ENABLED,
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_FLOW,
  DEFAULT_ORIENTATION,
} from '../../data/defaults';
import {
  DEFAULT_ALIGN_SEC,
  DEFAULT_RAMP_SEC,
  DEFAULT_LINGER,
  DEFAULT_LINGER_SEC,
  DEFAULT_SPLINE,
  DEFAULT_TURN_DELAY,
  DEFAULT_LOOK_AHEAD,
  DEFAULT_PASS_BY_OFFSET,
  DEFAULT_PASS_BY_DIR,
} from '../../services/engine/animation/pathDefaults';
import { DEBUG_OVERLAY_ROWS } from '../../data/debug/debugOverlayRows';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';

type CoreSeedShape = Omit<
  EngineSettingsState,
  | 'galaxyCatalogs'
  | 'starCatalogs'
  | 'structures'
  | 'volumes'
  | 'bodies'
  | 'earth'
  | 'orbitTrails'
  | 'sgrAStarLensingTuning'
  | 'milkyWay'
  | 'zoneOfAvoidance'
  | 'filaments'
  | 'constellations'
>;

export function coreSeed(): CoreSeedShape {
  return {
    // Camera orientation frame — the bare scalar "which pole is up" view
    // preference (spec §3.2). Seeded from `DEFAULT_ORIENTATION` so that file
    // stays the default's single source of truth (mirroring `tonemap.curve` ←
    // `DEFAULT_TONE_MAP_CURVE`).
    orientation: DEFAULT_ORIENTATION,
    // Camera lens: the vertical FOV slider. `cameraFraming.ts`'s boot-lens
    // constant derives from the same `DEFAULT_FOV_DEG`, so boot and slider
    // rest position agree by construction.
    camera: {
      fovDeg: DEFAULT_FOV_DEG,
    },
    tonemap: {
      exposure: DEFAULT_EXPOSURE,
      curve: DEFAULT_TONE_MAP_CURVE,
    },
    hdr: {
      enabled: DEFAULT_HDR_ENABLED,
      knee: DEFAULT_HDR_KNEE,
      headroom: DEFAULT_HDR_HEADROOM,
    },
    // Screen-space bloom: master gate + the two look knobs, each seeded from its
    // `data/defaults.ts` constant so that file stays the default's single source
    // of truth (mirroring `tonemap`). Read live by the bloom pass; `enabled`
    // gates the pass at frame-program build.
    bloom: {
      enabled: DEFAULT_BLOOM_ENABLED,
      strength: DEFAULT_BLOOM_STRENGTH,
      threshold: DEFAULT_BLOOM_THRESHOLD,
    },
    // Bias's user-tunable subset.  Bake-derived fields live on
    // `state.bias` (worker outputs, not settings).  The -19 default is
    // roughly where the SDSS spectroscopic main sample is volume-complete
    // out to the galaxy catalog's flux limit — bright enough that nearly every
    // catalog galaxy has a spectrum, dim enough to keep plenty of structure.
    bias: {
      mode: DEFAULT_BIAS_MODE,
      absMagLimit: DEFAULT_ABS_MAG_LIMIT,
    },
    thumbnails: {
      enabled: DEFAULT_GALAXY_TEXTURES_ENABLED,
    },
    // Flow is a singleton overlay layer: all its user-facing state (master
    // gate + look/motion knobs) lives here, spread from the single
    // `DEFAULT_FLOW` seed. Flow has no data-layer store — "loaded" is the asset
    // slot's own `ready` state (`slotReady(assetSlots.flow)`).
    flow: { ...DEFAULT_FLOW },
    // Cross-cutting label presentation: focusedOnly default OFF — all enabled
    // labels draw (the guided tour flips it on and its snapshot restores it).
    labels: { focusedOnly: false },
    debug: {
      // One entry per DEBUG_OVERLAY_ROWS row, all off — the roster is the
      // single source of truth so a new row can't ship unseeded.
      overlays: Object.fromEntries(DEBUG_OVERLAY_ROWS.map((row) => [row.key, false])) as Record<
        DebugOverlayKey,
        boolean
      >,
      // Empty in production: a developer populates it from the DebugPanel's
      // renderer-toggle section. A fresh record per engine — never persisted.
      disabledPasses: {},
      // 'auto' reproduces the old timing-derived pass shape, so production +
      // ?gpuTimings stay identical to before Joint 1 (see `resolveStrategy`).
      renderStrategy: 'auto',
      // Clip-path inspector idle: no clip chosen, scrubber at the start. The
      // overlay stays quiet until the curator clicks "Calculate". The pacing
      // knobs seed from the flyPath defaults but every override is INACTIVE, so a
      // fresh Calculate previews the clip's own authored pacing until the curator
      // touches a slider (which activates just that knob).
      clipPathInspect: {
        clipId: null,
        scrub01: 0,
        align: DEFAULT_ALIGN_SEC,
        rampSec: DEFAULT_RAMP_SEC,
        linger: DEFAULT_LINGER,
        lingerSec: DEFAULT_LINGER_SEC,
        spline: DEFAULT_SPLINE,
        turnDelay: DEFAULT_TURN_DELAY,
        lookAhead: DEFAULT_LOOK_AHEAD,
        passByOffset: DEFAULT_PASS_BY_OFFSET,
        passByDir: DEFAULT_PASS_BY_DIR,
        active: {
          align: false,
          rampSec: false,
          linger: false,
          spline: false,
          passBy: false,
        },
      },
    },
  };
}
