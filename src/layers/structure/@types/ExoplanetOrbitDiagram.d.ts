import type { StructureMarkerDescriptor } from './StructureMarkerDescriptor';
import type { ExoplanetOrbitPlane } from './ExoplanetOrbitPlane';

/** A frame's orbit diagram: host and planet dots, and the one plane in view. */
export type ExoplanetOrbitDiagram = {
  readonly markers: readonly StructureMarkerDescriptor[];
  readonly plane: ExoplanetOrbitPlane | null;
};
