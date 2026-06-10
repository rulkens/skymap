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
import type { LabelCategory } from '../@types/engine/data/LabelCategory';
import type { StructureCategory } from '../@types/engine/data/StructureCategory';
import { LABEL_CATEGORIES } from '../data/labelCategories';
import { STRUCTURE_CATEGORIES } from '../data/structureCategories';
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
  // intensity), the flow overlay slice, and the debug overlays (showPickBuffer,
  // showDiskRadiusRing) moved to the engine-owned settings store — the thumbnail
  // and milkyWay toggles have no React consumer (the thumbnail panel surface was
  // evicted; milkyWay's handle setter has no panel caller); App reads the
  // filaments cluster, the flow slice (via `selectFlow`), and the debug toggles
  // via `useSettingsStore` selectors, so no mirror cell or echo lives here.

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

  // ── Per-category visibility (two independent axes) ──────────────────
  // Engine echoes the full per-axis record on every matching setter call
  // (plus once at init via seedSettingsCallbacks).  Label and marker
  // visibility are kept as two separate records on purpose: conflating
  // them into one axis lets a category hidden on one axis silently
  // suppress it on the other.  Both seed to "all categories on" so first
  // paint matches the engine default.  The keys are DERIVED from each
  // axis's category set — labels span `LABEL_CATEGORIES` (famousGalaxy +
  // structures), markers span `STRUCTURE_CATEGORIES` only (no famous ring).
  const [labelCategoryVisibility, setLabelCategoryVisibility] = useState<
    Record<LabelCategory, boolean>
  >(
    () =>
      Object.fromEntries(LABEL_CATEGORIES.map((c) => [c, true])) as Record<LabelCategory, boolean>,
  );
  const [markerCategoryVisibility, setMarkerCategoryVisibility] = useState<
    Record<StructureCategory, boolean>
  >(
    () =>
      Object.fromEntries(STRUCTURE_CATEGORIES.map((c) => [c, true])) as Record<
        StructureCategory,
        boolean
      >,
  );

  return {
    settings: {
      filamentCounts,
      labelCategoryVisibility,
      markerCategoryVisibility,
      spaceMouseConnected,
      spaceMouseSensitivity,
    },
    engineCallbacks: {
      // ── Nested sub-bag subscriptions ─────────────────────────────
      // Every echo the engine emits lands at its nested address.
      // The surveys + sources + tonemap echo sub-bags are gone, and so are the
      // camera auto-rotate echo, the bias (mode / absMagLimit) echoes, the
      // thumbnails echo, the milkyWay echo, the filaments enabled/intensity
      // echoes, the debug echoes (showPickBuffer / showDiskRadiusRing), and the
      // volumes echo (master + per-field) — those clusters live in the
      // engine-owned store (the thumbnail + milkyWay toggles have no React
      // consumer at all; App reads the filaments cluster + debug toggles via
      // `useSettingsStore` selectors, the volumes master via `selectVolumesEnabled`
      // and the per-field rows via `selectVolumeFieldItems` + a `useMemo`
      // projection), so there's no mirror to keep in sync from a callback.
      // (Camera EVENTS — focus / camera / scale — are not settings and are wired
      // by `useEngine`, not here.)
      filaments: {
        // `onReady` is an EVENT, not a settings mirror: the engine fires it once
        // with the strip/vertex counts after `filaments.bin` lands. The toggle +
        // intensity SETTINGS migrated to the store; this count payload has no
        // store home, so the subscription stays.
        onReady: (stripCount, vertexCount) => setFilamentCounts({ stripCount, vertexCount }),
      },
      labels: {
        // Engine echoes the full record on every toggle; setting React
        // state to the same shape keeps the checkboxes in sync from a
        // single subscription.  Spread to drop the readonly wrapper
        // for React's mutable useState slot.  Two echoes for the two
        // independent axes — flipping one does NOT re-emit the other.
        onLabelCategoryVisibilityChange: (v) => setLabelCategoryVisibility({ ...v }),
        onMarkerCategoryVisibilityChange: (v) => setMarkerCategoryVisibility({ ...v }),
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
