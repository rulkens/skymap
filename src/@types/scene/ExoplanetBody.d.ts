import type { OrbitalElements } from './OrbitalElements';
import type { PlanetBody } from './PlanetBody';

/** One exoplanet, made: the body the planet passes draw, and the elements that place it. */
export type ExoplanetBody = { readonly body: PlanetBody; readonly elements: OrbitalElements };
