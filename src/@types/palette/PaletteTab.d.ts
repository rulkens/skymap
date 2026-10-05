import type { PaletteTabId } from './PaletteTabId';
import type { PaletteCard } from './PaletteCard';

/** One browse tab: its id, its strip label, and the cards it shows. */
export type PaletteTab = { id: PaletteTabId; label: string; cards: readonly PaletteCard[] };
