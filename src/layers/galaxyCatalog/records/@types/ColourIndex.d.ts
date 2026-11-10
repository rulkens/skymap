import type { GalaxyTypeInfo } from './GalaxyTypeInfo';
import type { GalaxyTypeMags } from './GalaxyTypeMags';

/** A catalog's colour index (`bluer` slot minus `redder` slot) and the classifier made for it. */
export type ColourIndex = {
  readonly bluer: keyof GalaxyTypeMags;
  readonly redder: keyof GalaxyTypeMags;
  readonly classify: (index: number) => GalaxyTypeInfo;
};
