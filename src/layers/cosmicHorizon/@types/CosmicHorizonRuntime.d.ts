/** The cosmic horizon's whole runtime: one renderer, built by `create` before any pass reads it. */

import type { HorizonShellRenderer } from './HorizonShellRenderer';

export type CosmicHorizonRuntime = {
  readonly renderer: HorizonShellRenderer;
};
