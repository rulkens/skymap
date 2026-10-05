import { DEFAULT_STAR_SIZE_PX } from '../defaults';
import type { StarCatalogSettings } from '../../../../@types/settings/StarCatalogSettings';

export const initialState: StarCatalogSettings = {
  enabled: true,
  sizePx: DEFAULT_STAR_SIZE_PX,
  brightness: 1.0, // identity on the shader's calibrated STAR_FLUX_EXPOSURE baseline
  // Tuned as a PAIR: a coarser cut exposes the octree's box lattice as faceted seams and a
  // wider aggregate glow hides them (1.0 = a glow exactly fills its box). Move one alone
  // and you get either a visible lattice or a soft, aggregate-heavy far field.
  refineThreshold: 0.16,
  glowOverlap: 3.0,
  // ABSOLUTE exposure the scale ramp targets at 1 pc / 3 kpc / 10 kpc. 6 is what the shader
  // bakes into STAR_FLUX_EXPOSURE (2400 = 400·6), so the ramp is 1.0 there; 23 ≈
  // 6·(28/6)^(log10(3000)/4) = 22.9, the log-line knot between the ends, so the default
  // three-anchor ramp is unbent.
  exposureNearX: 6,
  exposureMidX: 23,
  exposureFarX: 28,
  // Peak cap on AGGREGATE glows only (leaves stay uncapped). Light above it is DISCARDED,
  // not conserved: spreading it, as glowOverlap does, is exactly what makes a near
  // sub-threshold aggregate read as box-filling fog around the Sun.
  aggregateIntensityCap: 0.06,
  items: {
    gaiaStars: { enabled: true, labelEnabled: true },
    famousStar: { enabled: true, labelEnabled: true },
    sun: { enabled: true, labelEnabled: true },
    sStar: { enabled: true, labelEnabled: true },
  },
};
