import type { DEBUG_OVERLAY_ROWS } from '../../../data/debug/debugOverlayRows';

// Derived, never hand-listed — see DebugOverlayRow for why the domain is closed.
export type DebugOverlayKey = (typeof DEBUG_OVERLAY_ROWS)[number]['key'];
