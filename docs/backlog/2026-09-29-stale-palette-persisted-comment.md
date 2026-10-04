# `DEFAULT_VOLUME_PALETTE_ID`'s comment claims persistence that doesn't exist

`ready`.

## What is true today

- `src/data/defaults.ts:114-119` —
  ```
  /**
   * Default renderer-wide palette LUT for the scalar-volume overlay.
   * 'viridis' is matplotlib's perceptually-uniform default — neutral
   * blue-green-yellow ramp that reads as "scientific" without leaning
   * warm or cool.  Mutated at runtime via `setVolumePalette`; persisted
   * to localStorage by the App shell so reloads keep the user's choice.
   */
  export const DEFAULT_VOLUME_PALETTE_ID = 'viridis' as const;
  ```
- `grep -rn "localStorage" src` restricted to palette-related files finds
  nothing; there is no `localStorage` call anywhere near `volumePalette`,
  `setVolumePalette`, or `DEFAULT_VOLUME_PALETTE_ID`.
- `grep -rln "volumePalette" src` returns only `src/data/defaults.ts` itself
  (the comment's own line) — no consumer under `src/components/` or an App
  shell file reads or writes a persisted palette choice.

The "Mutated at runtime via `setVolumePalette`" half also does not resolve:
there is no `setVolumePalette` symbol anywhere in `src`. The palette choice
resets to `DEFAULT_VOLUME_PALETTE_ID` on every reload; nothing persists it.

## What would fix it

Delete the "persisted to localStorage by the App shell" sentence (and the
`setVolumePalette` reference, since that symbol doesn't exist) from the
comment, or — if persistence is actually wanted — add it and let the comment
describe real behavior.
