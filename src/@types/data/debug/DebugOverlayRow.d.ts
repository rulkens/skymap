/**
 * One developer toggle in the DebugPanel's "Debug Overlays" section: a stable
 * `key` in its own domain (#12) plus the checkbox label. The domain is NOT
 * derived from `CONTENT_LAYERS` — only one of the three toggles is a layer at
 * all. Trap: `'disk-radius-ring'` is byte-identical to `diskRadiusRingLayer.name`
 * and therefore to a `disabledPasses` key, with INVERTED polarity — absent means
 * SHOWN there, `false` means HIDDEN here. Membership in `DEBUG_OVERLAY_ROWS` is
 * what makes a toggle dev-only; there is no `devOnly` flag (decision #16 D3).
 */
export type DebugOverlayRow = { key: string; label: string };
