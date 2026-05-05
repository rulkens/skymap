/**
 * tooltips.tsx — glossary content for InfoCard rows.
 *
 * Each entry is `{ title, body }` paired to an InfoTip.  Bodies are
 * JSX (not just strings) so we can use line breaks, italics, and
 * `<code>` for unit symbols without escaping into HTML strings at the
 * call site.
 *
 * The glossary is intentionally co-located with InfoCard rather than
 * promoted to `src/data/`.  Two reasons:
 *
 *   - The wording is tuned for the InfoCard's surface: terse, written
 *     in the second person, assuming the reader is *looking at* the
 *     value the tip explains.  Lifting it into a generic glossary
 *     would require rewriting most entries to be context-free.
 *   - Tooltip copy churns more often than the values themselves.
 *     Keeping it next to the rendering site means PRs that reword a
 *     tip touch one file, not two.
 *
 * If a future component (e.g. SettingsPanel) ends up wanting the same
 * definitions, lift the affected entries into a shared module at
 * that point — premature centralisation here would just create a
 * dependency edge between unrelated UI areas.
 */

import type { ReactNode } from 'react';

export type TipContent = {
  title: string;
  body: ReactNode;
};

export const TIPS: Record<string, TipContent> = {
  distance: {
    title: 'Distance',
    body: (
      <>
        How far the galaxy is from us. Shown in two units: parsecs (pc, the
        astronomer's unit) and light-years (ly, the popular one). One
        parsec is about 3.26 light-years. The slash means "same number,
        two ways of saying it".
      </>
    ),
  },
  hubbleVelocity: {
    title: 'Recession velocity',
    body: (
      <>
        Speed at which the galaxy appears to move away from us, due to
        the expansion of space. Estimated from its redshift via Hubble's
        law: <code>v ≈ H₀ × d</code>, with H₀ ≈ 70 km/s/Mpc.
      </>
    ),
  },
  lookback: {
    title: 'Lookback time',
    body: (
      <>
        How long the light we see now has been travelling from this
        galaxy. The galaxy looks the way it did <em>then</em> — the
        present-day galaxy will be slightly older, redder, and at a
        slightly larger distance.
      </>
    ),
  },
  earthEra: {
    title: 'Earth era',
    body: (
      <>
        The geological era on Earth at the time this galaxy's light
        started its journey. A friendly anchor for "how long is X
        billion years, really".
      </>
    ),
  },
  ra: {
    title: 'Right ascension',
    body: (
      <>
        The galaxy's east-west position on the sky, the celestial
        equivalent of longitude. Shown both as sexagesimal time
        (hours / minutes / seconds) and decimal degrees. Ranges 0h to
        24h (0° to 360°).
      </>
    ),
  },
  dec: {
    title: 'Declination',
    body: (
      <>
        The galaxy's north-south position on the sky, the celestial
        equivalent of latitude. Shown as sexagesimal angle (degrees /
        arcminutes / arcseconds) and decimal degrees. Ranges −90° (south
        celestial pole) to +90° (north celestial pole).
      </>
    ),
  },
  redshift: {
    title: 'Redshift z',
    body: (
      <>
        The fractional stretching of the galaxy's spectrum on its way
        to us:{' '}
        <code>
          z = (λ<sub>obs</sub> − λ<sub>rest</sub>) / λ<sub>rest</sub>
        </code>
        . Cosmological redshift is mostly the expansion of space, not
        Doppler motion. Bigger z = more distant + further back in time.
      </>
    ),
  },
  apparentMag: {
    title: 'Apparent magnitude',
    body: (
      <>
        How bright the galaxy looks <em>from Earth</em> in this band.
        Lower numbers = brighter. The brightest stars sit near 0; the
        unaided eye reaches mag 6; this catalog goes down to about mag
        22. The system is logarithmic: each step of 5 mag is a 100×
        change in flux.
      </>
    ),
  },
  absoluteMag: {
    title: 'Absolute magnitude',
    body: (
      <>
        How bright the galaxy <em>actually</em> is — its apparent
        magnitude corrected to a standard distance of 10 parsecs. Strips
        away the "near things look brighter" effect so two galaxies of
        similar absolute mag are similarly luminous regardless of
        distance.
      </>
    ),
  },
  colour: {
    title: 'Colour index',
    body: (
      <>
        Difference between two band magnitudes, e.g. <code>g − r</code>.
        A bigger positive number = redder galaxy (more flux in the
        longer-wavelength band). Old, red, quiescent galaxies have
        large g − r; young, blue, star-forming galaxies have small or
        negative g − r.
      </>
    ),
  },
  diameter: {
    title: 'Physical diameter',
    body: (
      <>
        The galaxy's size in physical units (kpc / kly, matching
        decades). For surveys without a measured isophotal diameter,
        we estimate it from the absolute B-magnitude via the Tully
        size–luminosity relation. The provenance line below the value
        says which source we used for this row.
      </>
    ),
  },
  orientation: {
    title: 'Orientation (b/a, PA)',
    body: (
      <>
        <strong>b/a</strong> is the apparent ellipse axis ratio —{' '}
        <code>1.0</code> means face-on, <code>0.2</code> means highly
        edge-on. <strong>PA</strong> is the position angle of the major
        axis on the sky, measured east of north in degrees. Together
        they orient the rendered billboard to match the real galaxy's
        sky appearance.
      </>
    ),
  },
};
