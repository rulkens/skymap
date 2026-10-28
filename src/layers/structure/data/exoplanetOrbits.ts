import type { ExoplanetOrbitSystem } from '../@types/ExoplanetOrbitSystem';

/**
 * Orbits of the exoplanet-system anchors, keyed by structure id. From the NASA
 * Exoplanet Archive's pscomppars table (pl_orbsmax, pl_orbper, pl_tranmid,
 * st_lum), queried 2026-10-28. The habitable zone is Kopparapu et al. 2013's
 * conservative pair in its Sun-like form, sqrt(L / 1.10) to sqrt(L / 0.36) au,
 * without their stellar-temperature correction; a pulsar gets none. Each
 * host's seed radius mirrors this diagram's extent (pinned by a test), so a
 * focus frames the orbits rather than empty space around a dot. A host whose
 * planets are scene bodies (`EXOPLANET_PLANETS`) is left out: its trails draw it.
 */
export const EXOPLANET_ORBITS: Readonly<Record<string, ExoplanetOrbitSystem>> = {
  'exoplanet-system-51-pegasi': {
    habitableZoneAu: [1.11547, 1.94986],
    planets: [
      { name: "51 Peg b", semiMajorAxisAu: 0.052, periodDays: 4.2308, transitJd: 2456326.9323 },
    ],
  },
  'exoplanet-system-55-cancri': {
    habitableZoneAu: [0.760026, 1.32854],
    planets: [
      { name: "55 Cnc e", semiMajorAxisAu: 0.01544, periodDays: 0.736547, transitJd: 2457063.2096 },
      { name: "55 Cnc b", semiMajorAxisAu: 0.118, periodDays: 14.6516, transitJd: 2455495.595 },
      { name: "55 Cnc c", semiMajorAxisAu: 0.247, periodDays: 44.3936, transitJd: 2455491.23 },
      { name: "55 Cnc f", semiMajorAxisAu: 0.802, periodDays: 260.58, transitJd: 2455236.4 },
      { name: "55 Cnc d", semiMajorAxisAu: 5.6, periodDays: 4799.0, transitJd: 2451517.8 },
    ],
  },
  'exoplanet-system-beta-pictoris': {
    habitableZoneAu: [2.85571, 4.99182],
    planets: [
      { name: "bet Pic c", semiMajorAxisAu: 2.7, periodDays: 1202.0, transitJd: null },
      { name: "bet Pic b", semiMajorAxisAu: 10.07, periodDays: 8682.0, transitJd: null },
      { name: "bet Pic d", semiMajorAxisAu: 26.0, periodDays: 33200.0, transitJd: null },
    ],
  },
  'exoplanet-system-epsilon-eridani': {
    habitableZoneAu: [0.588388, 1.02851],
    planets: [
      { name: "eps Eri b", semiMajorAxisAu: 3.53, periodDays: 2680.0, transitJd: 2457388.0 },
    ],
  },
  'exoplanet-system-gliese-581': {
    habitableZoneAu: [0.106023, 0.185329],
    planets: [
      { name: "GJ 581 e", semiMajorAxisAu: 0.02799, periodDays: 3.1481, transitJd: null },
      { name: "GJ 581 b", semiMajorAxisAu: 0.0399, periodDays: 5.3686, transitJd: 2454724.631 },
      { name: "GJ 581 c", semiMajorAxisAu: 0.0718, periodDays: 12.9211, transitJd: 2455183.69 },
    ],
  },
  'exoplanet-system-hd-189733': {
    habitableZoneAu: [0.560672, 0.980062],
    planets: [
      { name: "HD 189733 b", semiMajorAxisAu: 0.03126, periodDays: 2.21858, transitJd: 2453955.5255511 },
    ],
  },
  'exoplanet-system-hd-209458': {
    habitableZoneAu: [1.24375, 2.1741],
    planets: [
      { name: "HD 209458 b", semiMajorAxisAu: 0.04707, periodDays: 3.52475, transitJd: 2451659.93742 },
    ],
  },
  'exoplanet-system-hr-8799': {
    habitableZoneAu: [2.21839, 3.87779],
    planets: [
      { name: "HR 8799 e", semiMajorAxisAu: 16.4, periodDays: 20815.6, transitJd: null },
      { name: "HR 8799 d", semiMajorAxisAu: 24.0, periodDays: 37000.0, transitJd: null },
      { name: "HR 8799 c", semiMajorAxisAu: 38.0, periodDays: 69000.0, transitJd: null },
      { name: "HR 8799 b", semiMajorAxisAu: 68.0, periodDays: 170000.0, transitJd: null },
    ],
  },
  'exoplanet-system-k2-18': {
    habitableZoneAu: [0.151657, 0.265099],
    planets: [
      { name: "K2-18 c", semiMajorAxisAu: 0.06, periodDays: 8.962, transitJd: null },
      { name: "K2-18 b", semiMajorAxisAu: 0.1429, periodDays: 32.9396, transitJd: 2457264.39144 },
    ],
  },
  'exoplanet-system-kepler-16': {
    habitableZoneAu: [0.337131, 0.58931],
    planets: [
      { name: "Kepler-16 b", semiMajorAxisAu: 0.7048, periodDays: 228.776, transitJd: 2455212.12316 },
    ],
  },
  'exoplanet-system-kepler-186': {
    habitableZoneAu: [0.193555, 0.338336],
    planets: [
      { name: "Kepler-186 b", semiMajorAxisAu: 0.0343, periodDays: 3.88679, transitJd: 2454966.3304 },
      { name: "Kepler-186 c", semiMajorAxisAu: 0.0451, periodDays: 7.2673, transitJd: 2455007.3142 },
      { name: "Kepler-186 d", semiMajorAxisAu: 0.0781, periodDays: 13.343, transitJd: 2455009.9045 },
      { name: "Kepler-186 e", semiMajorAxisAu: 0.11, periodDays: 22.4077, transitJd: 2454986.8006 },
      { name: "Kepler-186 f", semiMajorAxisAu: 0.432, periodDays: 129.944, transitJd: 2455789.494 },
    ],
  },
  'exoplanet-system-kepler-452': {
    habitableZoneAu: [1.05086, 1.83691],
    planets: [
      { name: "Kepler-452 b", semiMajorAxisAu: 1.046, periodDays: 384.843, transitJd: 2455147.985 },
    ],
  },
  'exoplanet-system-lhs-1140': {
    habitableZoneAu: [0.0587751, 0.10274],
    planets: [
      { name: "LHS 1140 c", semiMajorAxisAu: 0.027, periodDays: 3.77794, transitJd: 2458389.2939 },
      { name: "LHS 1140 b", semiMajorAxisAu: 0.0946, periodDays: 24.7372, transitJd: 2458399.93 },
    ],
  },
  'exoplanet-system-proxima-centauri': {
    habitableZoneAu: [0.0370505, 0.0647648],
    planets: [
      { name: "Proxima Cen d", semiMajorAxisAu: 0.02881, periodDays: 5.12338, transitJd: null },
      { name: "Proxima Cen b", semiMajorAxisAu: 0.04848, periodDays: 11.1846, transitJd: 2457897.9 },
    ],
  },
  'exoplanet-system-psr-b1257-12': {
    habitableZoneAu: null,
    planets: [
      { name: "PSR B1257+12 b", semiMajorAxisAu: 0.19, periodDays: 25.262, transitJd: null },
      { name: "PSR B1257+12 c", semiMajorAxisAu: 0.36, periodDays: 66.5419, transitJd: null },
      { name: "PSR B1257+12 d", semiMajorAxisAu: 0.46, periodDays: 98.2114, transitJd: null },
    ],
  },
  'exoplanet-system-tau-ceti': {
    habitableZoneAu: [0.670824, 1.17261],
    planets: [
      { name: "tau Cet g", semiMajorAxisAu: 0.133, periodDays: 20.0, transitJd: null },
      { name: "tau Cet h", semiMajorAxisAu: 0.243, periodDays: 49.41, transitJd: null },
      { name: "tau Cet f", semiMajorAxisAu: 1.334, periodDays: 636.13, transitJd: null },
    ],
  },
  'exoplanet-system-toi-700': {
    habitableZoneAu: [0.14554, 0.254407],
    planets: [
      { name: "TOI-700 b", semiMajorAxisAu: 0.0678, periodDays: 9.97722, transitJd: 2458880.0994 },
      { name: "TOI-700 c", semiMajorAxisAu: 0.0931, periodDays: 16.0511, transitJd: 2458821.6219 },
      { name: "TOI-700 e", semiMajorAxisAu: 0.1336, periodDays: 27.8101, transitJd: 2460772.46343 },
      { name: "TOI-700 d", semiMajorAxisAu: 0.1642, periodDays: 37.4235, transitJd: 2460763.01612 },
    ],
  },
  'exoplanet-system-wasp-12': {
    habitableZoneAu: [1.89609, 3.31439],
    planets: [
      { name: "WASP-12 b", semiMajorAxisAu: 0.0234, periodDays: 1.09142, transitJd: 2457607.519305 },
    ],
  },
};
