/**
 * PaletteTabId — the browse tabs shown in the palette's empty-query state.
 * PR3 adds 'tours'; left out here because a union member with no tab row
 * to back it is speculative.
 */

export type PaletteTabId =
  | 'highlights'
  | 'solarSystem'
  | 'missions'
  | 'milkyWay'
  | 'galaxies'
  | 'deepSpace';
