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
 *
 * Hook order in App.tsx matters: this runs first so its
 * `engineCallbacks` exist when `useEngine` constructs the engine.
 */

import { useState } from 'react';
import type { UseEngineSettingsReturn } from '../@types/settings/UseEngineSettingsReturn';

export function useEngineSettings(): UseEngineSettingsReturn {
  // Every SETTING lives in the engine-owned store and is read React-side via
  // `useSettingsStore` selectors — no mirror cell here. The one cell below is
  // the non-settings remainder (see the module header).

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

  return {
    settings: {
      filamentCounts,
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
    },
  };
}
