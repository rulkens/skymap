// Trap: 'disk-radius-ring' is byte-identical to a disabledPasses key
// (diskRadiusRingLayer.name), with INVERTED polarity — absent means SHOWN
// there, false means HIDDEN here. Membership in DEBUG_OVERLAY_ROWS is what
// makes a toggle dev-only, not a devOnly flag (decision #16 D3).
export type DebugOverlayRow = { key: string; label: string };
