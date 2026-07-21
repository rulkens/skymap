/**
 * tooltips.tsx — glossary content for InfoCard's InfoTip icons.
 * Bodies are JSX so they can carry line breaks, italics, and `<code>`.
 */

import type { ReactNode } from 'react';

type TipContent = {
  title: string;
  body: ReactNode;
};

export const TIPS: Record<string, TipContent> = {
  distance: {
    title: 'Distance',
    body: (
      <>
        How far the galaxy is from us. Shown in two units: parsecs (pc, the astronomer's unit) and
        light-years (ly, the popular one). One parsec is about 3.26 light-years. The slash means
        "same number, two ways of saying it".
      </>
    ),
  },
  hubbleVelocity: {
    title: 'Recession velocity',
    body: (
      <>
        How fast the distance between us and this object grows right now, due to the expansion of
        space. Hubble's law applied at its present-day distance: <code>v = H₀ × d</code>, with H₀ ≈
        70 km/s/Mpc. Beyond z ≈ 1.5 this <em>exceeds the speed of light</em> — that's real
        cosmology, not a bug: space itself is expanding, and nothing is moving <em>through</em>{' '}
        space faster than light.
      </>
    ),
  },
  lookback: {
    title: 'Lookback time',
    body: (
      <>
        How long the light we see now has been travelling from this galaxy. The galaxy looks the way
        it did <em>then</em> — the present-day galaxy will be slightly older, redder, and at a
        slightly larger distance.
      </>
    ),
  },
  earthEra: {
    title: 'Earth era',
    body: (
      <>
        The geological era on Earth at the time this galaxy's light started its journey. A friendly
        anchor for "how long is X billion years, really".
      </>
    ),
  },
  ra: {
    title: 'Right ascension',
    body: (
      <>
        The galaxy's east-west position on the sky, the celestial equivalent of longitude. Shown
        both as sexagesimal time (hours / minutes / seconds) and decimal degrees. Ranges 0h to 24h
        (0° to 360°).
      </>
    ),
  },
  dec: {
    title: 'Declination',
    body: (
      <>
        The galaxy's north-south position on the sky, the celestial equivalent of latitude. Shown as
        sexagesimal angle (degrees / arcminutes / arcseconds) and decimal degrees. Ranges −90°
        (south celestial pole) to +90° (north celestial pole).
      </>
    ),
  },
  redshift: {
    title: 'Redshift z',
    body: (
      <>
        The fractional stretching of the galaxy's spectrum on its way to us:{' '}
        <code>
          z = (λ<sub>obs</sub> − λ<sub>rest</sub>) / λ<sub>rest</sub>
        </code>
        . Cosmological redshift is mostly the expansion of space, not Doppler motion. Bigger z =
        more distant + further back in time.
      </>
    ),
  },
  apparentMag: {
    title: 'Apparent magnitude',
    body: (
      <>
        How bright the galaxy looks <em>from Earth</em> in this band. Lower numbers = brighter. The
        brightest stars sit near 0; the unaided eye reaches mag 6; this catalog goes down to about
        mag 22. The system is logarithmic: each step of 5 mag is a 100× change in flux.
      </>
    ),
  },
  absoluteMag: {
    title: 'Absolute magnitude',
    body: (
      <>
        How bright the galaxy <em>actually</em> is — its apparent magnitude corrected to a standard
        distance of 10 parsecs. Strips away the "near things look brighter" effect so two galaxies
        of similar absolute mag are similarly luminous regardless of distance.
      </>
    ),
  },
  colour: {
    title: 'Colour index',
    body: (
      <>
        Difference between two band magnitudes, e.g. <code>g − r</code>. A bigger positive number =
        redder galaxy (more flux in the longer-wavelength band). Old, red, quiescent galaxies have
        large g − r; young, blue, star-forming galaxies have small or negative g − r.
      </>
    ),
  },
  diameter: {
    title: 'Physical diameter',
    body: (
      <>
        The galaxy's size in physical units (kpc / kly, matching decades). For galaxy catalogs
        without a measured isophotal diameter, we estimate it from the absolute B-magnitude via the
        Tully size–luminosity relation. The provenance line below the value says which source we
        used for this row.
      </>
    ),
  },
  orientation: {
    title: 'Orientation (b/a, PA)',
    body: (
      <>
        <strong>b/a</strong> is the apparent ellipse axis ratio — <code>1.0</code> means face-on,{' '}
        <code>0.2</code> means highly edge-on. <strong>PA</strong> is the position angle of the
        major axis on the sky, measured east of north in degrees. Together they orient the rendered
        billboard to match the real galaxy's sky appearance.
      </>
    ),
  },

  // ── Structure rows (cluster / supercluster / void / group) ──────────────
  structureDistance: {
    title: 'Distance',
    body: (
      <>
        How far the centre of this structure is from us, in parsecs (pc) and light-years (ly). It's
        the distance to the catalogued centre — individual member galaxies are spread out in front
        of and behind it.
      </>
    ),
  },
  structureRadius: {
    title: 'Radius',
    body: (
      <>
        The structure's physical half-size — the radius of the sphere we treat as its membership
        volume, and the size of the ring drawn on the sky. It's a radius, not a diameter.
      </>
    ),
  },
  memberCount: {
    title: 'Member galaxies',
    body: (
      <>
        How many catalogued galaxies fall inside this structure's sphere at your current tier and
        galaxy catalog selection. It rises as you load larger tiers or enable more galaxy catalogs —
        read it as "how many we can show", not the true population.
      </>
    ),
  },
  abell: {
    title: 'Abell designation',
    body: (
      <>
        The cluster's entry in the Abell/ACO catalogue of rich galaxy clusters (George Abell 1958,
        with a 1989 southern extension). For example <code>A1656</code> is the Coma Cluster.
      </>
    ),
  },

  // ── Field-star derived properties (temperature / luminosity / radius) ──────
  starDerived: {
    title: 'Estimated from colour + magnitude',
    body: (
      <>
        Estimated from the star's absolute magnitude and BP−RP colour (Mucciarelli+21 for
        temperature, Andrae+18 for the bolometric correction). Assumes solar metallicity and applies{' '}
        <em>no</em> extinction correction, so a reddened distant star reads too cool and too large.
        Order-of-magnitude figures, not measurements — a leading <code>~</code> marks a colour
        outside the relation's calibrated range.
      </>
    ),
  },
};
