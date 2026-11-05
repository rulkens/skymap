/**
 * S_STAR_ORBITAL_ELEMENTS — the 39 bound S-stars, converted once from
 * `sStarElements.ts`'s raw seeds. Read twice: `orbitalElements.ts` spreads it
 * into `ORBITAL_ELEMENTS` (positions), and the star Layer's `guides.orbitTrails`
 * reads it for trails — declared once here so neither reader owns the other.
 */

import { sStar } from './makers/sStar';
import { S_STAR_SEEDS } from './sStarElements';
import type { OrbitalElements } from '../../@types/scene/OrbitalElements';

export const S_STAR_ORBITAL_ELEMENTS: readonly OrbitalElements[] = S_STAR_SEEDS.map(sStar);
