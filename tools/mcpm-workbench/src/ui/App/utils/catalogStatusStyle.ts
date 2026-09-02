import type { CSSProperties } from 'react';
import { statusStyle } from './statusStyle';

// Stacked above the (dev-only) packed-drop status line rather than sharing its
// slot: catalog.statusMessage (e.g. "no catalog points") can be live in prod,
// so the two must never silently overlap if both happen to be set at once.
export const catalogStatusStyle: CSSProperties = { ...statusStyle, bottom: 44 };
