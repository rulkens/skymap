/**
 * galaxyTips: glossary content for the galaxy detail card's InfoTip icons.
 * Typed keys, not Record<string, ...>, so the card reads them without `!`.
 * `diameter` is shared with the Milky Way card and stays in core `TIPS`.
 */

import type { TipContent } from '../../../../@types/components/infoCard/TipContent';

export const GALAXY_TIPS = {
  distance: {
    title: 'Distance',
    body: (
      <>
        How far this galaxy lies from us. The numbers are so vast that astronomers switch to the
        parsec (pc): one parsec is 3.26 light-years, and a light-year is how far light travels in a
        year, about 6 trillion miles. Galaxies run to millions of parsecs, so you'll see megaparsecs
        (Mpc). We show light-years alongside because that's the unit most people picture; the slash
        just means "same distance, said two ways."
      </>
    ),
  },
  hubbleVelocity: {
    title: 'Recession velocity',
    body: (
      <>
        How fast the gap between us and this galaxy is widening as space itself expands. Almost
        every galaxy is rushing away, and the farther one sits, the faster it goes, the fingerprint
        of an expanding universe that Lemaître and Hubble uncovered in the 1920s. The rule is just{' '}
        <code>v = H₀ × d</code>, with H₀ ≈ 70 km/s per megaparsec. Far enough out, this speed{' '}
        <em>exceeds light</em>. That's allowed, because space is stretching; nothing is racing{' '}
        <em>through</em> it.
      </>
    ),
  },
  lookback: {
    title: 'Lookback time',
    body: (
      <>
        Light isn't instant. It takes time to cross space, so we always see distant things as they{' '}
        <em>were</em>. Sunlight reaches us already 8 minutes old; this galaxy's light has been on
        the way far longer, so you're seeing it as it looked that many years ago, not today. The
        real galaxy has kept aging, reddening, and drifting farther off in the meantime. To look out
        into space is to look back in time.
      </>
    ),
  },
  earthEra: {
    title: 'Earth era',
    body: (
      <>
        A way to <em>feel</em> how long this galaxy's light has been travelling: what was happening
        on Earth when it set out. If it left during the age of the dinosaurs, that ancient light is
        what's landing in your eye right now. Billions of years are almost impossible to picture.
        Pinning them to Earth's own story makes the distance real.
      </>
    ),
  },
  ra: {
    title: 'Right ascension',
    body: (
      <>
        Where the galaxy sits east-to-west on the sky, the sky's version of longitude. Just as every
        place on Earth has a longitude, every star and galaxy has a right ascension, so anyone can
        aim a telescope at the same spot. It's counted in hours, minutes and seconds (0h to 24h)
        because the sky appears to wheel around once a day, like a giant clock. We show the
        plain-degrees version (0° to 360°) beside it.
      </>
    ),
  },
  dec: {
    title: 'Declination',
    body: (
      <>
        Where the galaxy sits north-to-south on the sky, the sky's version of latitude. It runs from
        +90° at the north celestial pole (straight above Earth's North Pole), through 0° at the
        celestial equator, down to −90° at the south pole. Paired with right ascension it pins any
        object to one exact spot on the sky. Shown as degrees/arcminutes/arcseconds and as plain
        degrees.
      </>
    ),
  },
  redshift: {
    title: 'Redshift z',
    body: (
      <>
        As space expands, it stretches the light waves crossing it toward the red
        (longer-wavelength) end of the spectrum. Redshift measures how much. The formula{' '}
        <code>
          z = (λ<sub>obs</sub> − λ<sub>rest</sub>) / λ<sub>rest</sub>
        </code>{' '}
        just compares the wavelength we receive with the one the galaxy emitted; a z of 1 means the
        waves arrived twice as long as they left. Bigger z means farther away and further back in
        time, cosmology's tape measure.
      </>
    ),
  },
  apparentMag: {
    title: 'Apparent magnitude',
    body: (
      <>
        How bright the galaxy <em>looks</em> from Earth. The scale is a 2,000-year-old ranking from
        the Greek astronomer Hipparchus, who called the brightest stars "first magnitude" and the
        faintest "sixth", so it runs <em>backwards</em>: smaller numbers mean brighter. It's also
        logarithmic, with every 5 steps a 100× change in brightness. The unaided eye reaches about
        mag 6; this catalog dives to around mag 22, far fainter than any eye can see.
      </>
    ),
  },
  absoluteMag: {
    title: 'Absolute magnitude',
    body: (
      <>
        A fair brightness contest: how bright the galaxy would appear if every object were moved to
        the same standard distance of 10 parsecs (about 33 light-years). Apparent brightness
        misleads us because nearer things look brighter; absolute magnitude strips that away to
        reveal true output. Our Sun's absolute magnitude is 4.83, a handy yardstick; a whole galaxy
        glowing at −21 outshines it billions of times over.
      </>
    ),
  },
  colour: {
    title: 'Colour index',
    body: (
      <>
        A galaxy's colour is a thermometer. This number subtracts brightness in a redder filter from
        a bluer one (e.g. <code>g − r</code>), the same idea as judging a heated iron bar by whether
        it glows red, orange or white. Hot, young, star-forming galaxies lean blue (small or
        negative values); old galaxies full of cool red stars lean red (large values). This one
        figure reveals a galaxy's stellar age without resolving a single star.
      </>
    ),
  },
  orientation: {
    title: 'Orientation (b/a, PA)',
    body: (
      <>
        How the galaxy is tilted to our line of sight. <strong>b/a</strong> is how squashed its
        outline looks. <code>1.0</code> is a perfect circle (face-on, like looking down at a plate),{' '}
        <code>0.2</code> is a thin sliver (edge-on, the plate seen from the side).{' '}
        <strong>PA</strong> (position angle) is the compass direction of its long axis, in degrees
        measured east of north. Together they let us tilt the on-screen billboard to match the real
        galaxy.
      </>
    ),
  },

  // ── Body rows (planets / moons) + galaxy AGN ───────────────
  agnClass: {
    title: 'Active nucleus (AGN)',
    body: (
      <>
        This galaxy hosts an active galactic nucleus: a supermassive black hole at its core, feeding
        on gas and blazing so fiercely it can outshine every star in the galaxy combined. The class
        name (Seyfert, quasar, blazar, and so on) mostly reflects our viewing angle and how
        furiously the black hole is feeding. They rank among the most luminous and most distant
        objects we can see.
      </>
    ),
  },
} as const satisfies Record<string, TipContent>;
