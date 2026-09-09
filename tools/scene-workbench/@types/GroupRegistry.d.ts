import type { GroupRegistryEntry } from './GroupRegistryEntry';

/** Shape of `public/data/geo3d/scenes.json` — a data file, not TypeScript;
 *  this type only describes what a CLI writes and the viewer reads. */
export type GroupRegistry = {
  readonly formatVersion: 1;
  readonly groups: readonly GroupRegistryEntry[];
};
