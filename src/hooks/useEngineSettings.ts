/**
 * `useEngineSettings` — the thin React holder for the few engine-driven
 * values that are NOT settings.
 *
 * ──────────────────────────────────────────────────────────────────────
 * Why this is now tiny
 * ──────────────────────────────────────────────────────────────────────
 * Every actual SETTING (point size, brightness, exposure, auto-rotate,
 * the bias / thumbnail / milkyWay / filaments / debug / volumes /
 * structures-labels clusters, …) lives in the engine-owned settings
 * store. React reads each one via a `useStore` selector through
 * `useSettingsStore`, so there is no mirror cell and no echo-mirror
 * protocol to keep in sync here. The store is seeded at construction
 * from the same `data/defaults.ts` values, so the first paint matches
 * engine truth before `handleRef` lands.
 *
 * What's left is EVENT-shaped — things the engine *did* that have no
 * store home:
 *
 *   - `filamentCounts` — the one-shot strip/vertex count payload the
 *     engine fires through `filaments.onReady` after `filaments.bin`
 *     lands. A property of the file, not a settings leaf.
 *   - `spaceMouseConnected` — the puck connect/disconnect echo
 *     (`input.spaceMouse.onConnectedChange`).
 *   - `spaceMouseSensitivity` — App-owned optimistic state: the
 *     SpaceMouse subsystem has no echo callback for it, so React owns
 *     the value and dual-writes to the engine handle. It is NOT in
 *     `EngineSettingsState`, so it does not move to the store in this
 *     effort.
 *
 * Hook order in App.tsx matters: this runs first so its
 * `engineCallbacks` exist when `useEngine` constructs the engine.
 */

import { useState } from 'react';
import { DEFAULT_SPACE_MOUSE_SENSITIVITY } from '../data/defaults';
import type { UseEngineSettingsReturn } from '../@types/settings/UseEngineSettingsReturn';

export function useEngineSettings(): UseEngineSettingsReturn {
  // Every SETTING lives in the engine-owned store and is read React-side via
  // `useSettingsStore` selectors — no mirror cell here. The three cells below
  // are the non-settings remainder (see the module header).

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
  // and it is not in `EngineSettingsState`, so it does not move to the
  // store. Seeded from `DEFAULT_SPACE_MOUSE_SENSITIVITY` so the slider thumb
  // has a sensible position before the user touches it.
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
      // Only EVENT subscriptions live here — every settings echo is gone (the
      // clusters moved to the engine-owned store; React reads them via
      // `useSettingsStore` selectors). Camera EVENTS — focus / camera / scale —
      // are wired by `useEngine`, not here.
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
