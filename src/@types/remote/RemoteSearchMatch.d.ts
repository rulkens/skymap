import type { PaletteAction } from '../palette/PaletteAction';

/** One search answer as the remote shows it; `action` goes back verbatim as a `goTo` command. */
export type RemoteSearchMatch = { name: string; kind: string; action: PaletteAction };
