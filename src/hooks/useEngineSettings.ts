/**
 * `useEngineSettings` — the bulk of App.tsx's render-pass settings
 * state and the engine-callback slice that keeps it in sync.
 *
 * ──────────────────────────────────────────────────────────────────────
 * The pattern this consolidates
 * ──────────────────────────────────────────────────────────────────────
 * Most fields here follow the same lifecycle:
 *
 *   1. React seeds an initial value from `data/defaults.ts` so the
 *      SettingsPanel renders a useful first paint before the engine's
 *      first echo lands.
 *   2. The engine fires an echo callback (e.g.
 *      `labels.onMarkerCategoryVisibilityChange`) both at engine init AND on
 *      every matching setter call, so the React copy always reflects the
 *      engine's authoritative value.
 *   3. The SettingsPanel onChange handler in App.tsx forwards user
 *      input to the engine handle (e.g.
 *      `handleRef.current?.structures.setItemEnabled(cat, v)`) and the engine
 *      echoes it right back, so no optimistic local update is needed — except
 *      for the exceptions below.
 *
 * The surveys cluster (pointSize / brightness / depthFade /
 * highlightFallback / realOnly / the derived source mask), the tonemap cluster
 * (exposure / curve), the camera auto-rotate flag, the bias cluster (mode /
 * absMagLimit), the galaxy-thumbnail master toggle, the Milky-Way disk toggle,
 * and the debug overlays (showPickBuffer / showDiskRadiusRing) have LEFT this
 * pattern: they live in the engine-owned settings store. The store-backed
 * values App still surfaces are read via `useSettingsStore` selectors instead
 * of a mirror cell here (the DebugPanel reads the debug toggles this way); the
 * thumbnail and milkyWay toggles have no React consumer at all (the thumbnail
 * panel surface was evicted, the engine reads it each frame; milkyWay's handle
 * setter has no panel caller).
 * The tonemap migration
 * also dissolved the `exposure` hybrid: the store write notifies synchronously,
 * so the slider thumb tracks without an optimistic local cell.
 *
 * ──────────────────────────────────────────────────────────────────────
 * The App-owned exceptions
 * ──────────────────────────────────────────────────────────────────────
 *   - `spaceMouseSensitivity` — no-echo: React owns the value
 *     optimistically and dual-writes to the engine handle.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why bundle into one hook?
 * ──────────────────────────────────────────────────────────────────────
 * Each individual setting is trivial; the win is collecting ~150 lines
 * of `useState` declarations + their inline rationale into one place
 * the SettingsPanel can read from.  App.tsx is freed to focus on the
 * higher-level wiring.
 */

import { useState } from 'react';
import { DEFAULT_SPACE_MOUSE_SENSITIVITY } from '../data/defaults';
import type { UseEngineSettingsReturn } from '../@types/settings/UseEngineSettingsReturn';

export function useEngineSettings(): UseEngineSettingsReturn {
  // ── Engine-echoed values ─────────────────────────────────────────────
  // Each of these is seeded from `data/defaults.ts` so the SettingsPanel
  // renders a correct first frame before the engine's init echo arrives.
  // The engine fires each echo callback both at startup (initial seed)
  // and on every setter call, so these values always reflect engine truth.
  // Surveys-cluster settings (pointSize, brightness, depthFade,
  // highlightFallback, realOnly, and the derived visibleSourceMask), the
  // tonemap cluster (exposure, curve), camera auto-rotate, the galaxy-thumbnail
  // master toggle, the Milky-Way disk toggle, the filaments cluster (enabled,
  // intensity), the flow overlay slice, the debug overlays (showPickBuffer,
  // showDiskRadiusRing), and the structures / labels cluster (per-category
  // marker + label visibility) moved to the engine-owned settings store — the
  // thumbnail and milkyWay toggles have no React consumer (the thumbnail panel
  // surface was evicted; milkyWay's handle setter has no panel caller); App reads
  // the filaments cluster, the flow slice (via `selectFlow`), the debug toggles,
  // and the structure/survey item records (via `selectStructureItems` /
  // `selectSurveyItems` + `useMemo` projections) via `useSettingsStore`
  // selectors, so no mirror cell or echo lives here.

  // ── App-owned optimistic values (no engine echo) ─────────────────────

  // ── One-shot from engine: filament strip + vertex counts ─────────────
  // Stays null until the engine fires `onFilamentsReady` (once, after the
  // optional `filaments.bin` lands).  The StatsPanel uses this to decide
  // whether to render the filaments row — when the file isn't on disk
  // (fresh clone before `npm run build-filaments`), this stays null and
  // the row stays hidden, which is the visually-clean default.
  const [filamentCounts, setFilamentCounts] = useState<{
    stripCount: number;
    vertexCount: number;
  } | null>(null);

  // ── SpaceMouse 6DOF input state ──────────────────────────────────────
  // `spaceMouseConnected` mirrors the engine's puck state.  The engine
  // fires `input.spaceMouse.onConnectedChange(connected)` from a single
  // site (`spaceMouseSubsystem`'s onConnectionChange callback), covering
  // explicit connect, explicit disconnect, AND unsolicited unplugs /
  // permission revocations — so a single subscription keeps the
  // SettingsPanel's "connected / not connected" indicator authoritative.
  // Seeded with `false` (no puck at startup); the subsystem's silent
  // re-acquire pass will fire the echo asynchronously if a
  // previously-paired device is still attached.
  const [spaceMouseConnected, setSpaceMouseConnected] = useState<boolean>(false);

  // Sensitivity is App-owned optimistic state: the engine has no echo
  // callback for it (the subsystem's setSensitivity is fire-and-forget),
  // matching the filaments / volumes pattern.  Seeded from
  // `DEFAULT_SPACE_MOUSE_SENSITIVITY` so the slider thumb has a sensible
  // position before the user touches it.
  const [spaceMouseSensitivity, setSpaceMouseSensitivity] = useState<number>(
    DEFAULT_SPACE_MOUSE_SENSITIVITY,
  );

  return {
    settings: {
      filamentCounts,
      spaceMouseConnected,
      spaceMouseSensitivity,
    },
    engineCallbacks: {
      // ── Nested sub-bag subscriptions ─────────────────────────────
      // Every echo the engine emits lands at its nested address.
      // The surveys + sources + tonemap echo sub-bags are gone, and so are the
      // camera auto-rotate echo, the bias (mode / absMagLimit) echoes, the
      // thumbnails echo, the milkyWay echo, the filaments enabled/intensity
      // echoes, the debug echoes (showPickBuffer / showDiskRadiusRing), the
      // volumes echo (master + per-field), and the labels echoes (per-category
      // marker + label visibility) — those clusters live in the engine-owned
      // store (the thumbnail + milkyWay toggles have no React consumer at all;
      // App reads the filaments cluster + debug toggles via `useSettingsStore`
      // selectors, the volumes master via `selectVolumesEnabled` and the
      // per-field rows via `selectVolumeFieldItems` + a `useMemo` projection, and
      // the marker/label records via `selectStructureItems` / `selectSurveyItems`
      // + `useMemo` projections), so there's no mirror to keep in sync from a
      // callback. (Camera EVENTS — focus / camera / scale — are not settings and
      // are wired by `useEngine`, not here.)
      filaments: {
        // `onReady` is an EVENT, not a settings mirror: the engine fires it once
        // with the strip/vertex counts after `filaments.bin` lands. The toggle +
        // intensity SETTINGS migrated to the store; this count payload has no
        // store home, so the subscription stays.
        onReady: (stripCount, vertexCount) => setFilamentCounts({ stripCount, vertexCount }),
      },
      input: {
        // SpaceMouse connection echo — fires for pair / explicit
        // disconnect / unsolicited HID disconnect.  Without this the
        // "connected" indicator can persist after the puck is gone.
        spaceMouse: {
          onConnectedChange: setSpaceMouseConnected,
        },
      },
    },
    setSpaceMouseSensitivity,
  };
}
