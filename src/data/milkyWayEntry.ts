/**
 * Milky Way pseudo-entry for the command palette.
 *
 * The Milky Way isn't in any catalog `.bin` — it's rendered as the
 * procedural impostor in `milkyWayRenderer.ts` and has no per-galaxy
 * `(source, localIdx)` tuple to select.  Pre-fix the palette searched
 * only the catalogues, so users typing "milky way" got zero results
 * for the most-asked-after object in the entire dataset.
 *
 * The fix is intentionally narrow: we don't promote the Milky Way to a
 * real `Source` (that's a larger architectural decision the user
 * deferred) — we just inject a single famous-meta-shaped pseudo-entry
 * into the palette's `entries` and intercept its sentinel id at the
 * App.tsx onSelect site.  When selected, the action is `focusOnHome()`
 * — the bootstrap framing is the only viewing context where the Milky
 * Way impostor is the dominant subject (it's a backdrop, not a target
 * coordinate; you can't "fly to" it).
 *
 * ### Why the underscore-wrapped id
 *
 * `MILKY_WAY_ID` uses double-underscores (`__milky-way__`) so the
 * sentinel can never collide with a real catalog id from `famous.bin`
 * (which uses bare slugs like `andromeda` or `m31`).  The interceptor
 * in App.tsx's `onSelect` branches on this exact id; any future
 * pseudo-entries added the same way would use a parallel sentinel.
 *
 * ### Why the multiple `names`
 *
 * The palette's match scorer looks across every entry in `names`, so
 * including "Galaxy", "Home", and "Solar System Galaxy" lets the user
 * find this entry via several intuitive searches without having to
 * remember the exact phrase "Milky Way".  The first name is what
 * renders in the result row.
 */

import type { FamousMetaEntry } from '../services/loading/fetchers/famousMetaFetcher';

/**
 * Sentinel id for the Milky Way pseudo-entry.  Intercepted in App.tsx's
 * `CommandPalette` `onSelect` handler — anything matching this id
 * routes to `engine.focusOnHome()` instead of `engine.selectFamous(id)`
 * (which would fail because the engine's `famousMeta` array has no
 * matching record).
 */
export const MILKY_WAY_ID = '__milky-way__';

export const MILKY_WAY_ENTRY: FamousMetaEntry = {
  id: MILKY_WAY_ID,
  names: ['Milky Way', 'Galaxy', 'Home', 'Solar System Galaxy'],
  description:
    'Our home galaxy. Selecting returns to the home view, where the Milky Way ' +
    'impostor surrounds the camera. The Milky Way is rendered as a procedural ' +
    'backdrop rather than a catalog object, so it has no individual position ' +
    'to fly to — instead, going "home" places you back at the bootstrap ' +
    'framing where its band is most visible.',
  type: 'Spiral',
};
