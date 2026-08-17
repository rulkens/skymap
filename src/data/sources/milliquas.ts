import type { GalaxyCatalogSourceEntry } from '../../@types/data/galaxyCatalog/GalaxyCatalogSourceEntry';
import { Source } from '../source';

export const MILLIQUAS_ENTRY = {
  type: 'galaxyCatalog',
  code: Source.Milliquas,
  id: 'milliquas',
  label: 'Milliquas',
  binBaseName: 'milliquas',
  allSky: true,
  bearsLabel: false,
  bearsMarker: false,
  // Visible by default: the quasar source is stable enough to ship on.
  // It renders with the shared galaxy-billboard path (no quasar-specific
  // visuals yet), which is acceptable for the bright low-z tail the
  // catalog mostly shows.
  visible: true,
  // Milliquas reaches z ~ 7 (quasars at the edge of the observable
  // universe). Hubble's law with z = 7 ⇒ ~25 Gpc, but the bulk of
  // Milliquas is at z < 3 (~12 Gpc). While the renderer uses the
  // linear-Hubble approximation, this is a *display* limit generous
  // enough to keep the bright low-z tail framed comfortably.
  maxDistMpc: 4000,
  // Milliquas carries two optical-band magnitudes only: Rmag (red, ~R)
  // and Bmag (blue, ~B). Bmag goes into the magG slot (closest
  // wavelength to SDSS g among the empty slots) and Rmag into magR.
  bandLabels: { u: '—', g: 'B', r: 'R', i: '—', z: '—' },
  // B−R is the natural quasar colour: blue quasars sit near 0; red /
  // dust-obscured AGN extend to ≳ 2. kPerZ is 0: the K-correction is
  // expressed in ramp-position units over a span of only 2.0, but
  // Milliquas redshifts run z ≈ 1–7, so any non-zero coefficient
  // subtracts most of the range and clamps the whole catalog to the
  // blue floor. The correction stays off until a quasar-specific
  // bias-correction subsystem wires Milliquas in with its own QLF.
  colourSpec: { slotA: 'g', slotB: 'r', rangeMin: 0.0, rangeMax: 2.0, kPerZ: 0.0 },
  // Milliquas's quasar-completeness limit varies wildly by parent
  // galaxy catalog (SDSS DR16Q reaches r ~ 22, DESI EDR ~ 23, bright optical/
  // X-ray-selected subsamples cut at ~18). We use a permissive limit
  // so vMaxWeight short-circuits rather than upweighting an unphysical
  // volume — a per-parent-survey breakdown would belong in its own pass.
  mLim: 22.0,
  // Quasars don't follow the galaxy Schechter LF — they have their
  // own QLF (Croom et al. 2009, Ross et al. 2013) with very different
  // parameters. The SDSS galaxy values are a placeholder for the
  // shape; vMaxWeight short-circuits to zero for NaN-photometry rows
  // so this rarely fires in practice.
  schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 },
  // Matches the upstream catalogue's own short-name convention.
  iauPrefix: 'MQ',
  // small caps at ~60k brightest for the mobile GPU budget; medium caps at
  // ~200k brightest; large is uncapped.
  tierTargets: { small: 60_000, medium: 200_000 },
  // SB boost — Milliquas quasars are intrinsically faint in the physical
  // model; lift them.
  sbBoost: 3.0,
  falloffHalfMpc: 1e30,
} as const satisfies GalaxyCatalogSourceEntry;
