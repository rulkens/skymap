/**
 * starTips — glossary content for the star detail card's InfoTip icons.
 * Typed keys, not Record<string, …>, so the card reads them without `!`.
 */

import type { TipContent } from '../../../../@types/components/infoCard/TipContent';

export const STAR_TIPS = {
  // ── Field-star catalogued rows ──────────────────────────────────────────
  starDistance: {
    title: 'Distance',
    body: (
      <>
        How far this star lies from us, in parsecs (pc). One parsec is 3.26 light-years, the
        distance at which Earth's whole orbit would look just one arcsecond wide, which is where the
        odd name comes from ("parallax-second"). Even the nearest star beyond the Sun, Proxima
        Centauri, sits 1.3 pc away, about 4.2 light-years, or 25 trillion miles. Space is far
        emptier than almost anyone pictures.
      </>
    ),
  },
  starAbsoluteMag: {
    title: 'Absolute magnitude',
    body: (
      <>
        How bright the star <em>truly</em> is, not just how bright it looks. It's the brightness the
        star would show if placed at a standard distance of 10 parsecs (about 33 light-years), so a
        faint-but-close star and a bright-but-distant one can be compared fairly. Our Sun's absolute
        magnitude is 4.83, a useful yardstick. Remember the scale runs backwards: the smaller (or
        more negative) the number, the more luminous the star.
      </>
    ),
  },
  starApparentMag: {
    title: 'Apparent magnitude',
    body: (
      <>
        How bright the star <em>looks</em> in our sky, which depends on both its real output and its
        distance. The scale runs backwards and is logarithmic: brighter means a smaller number, and
        every 5 steps is a 100× jump. The full Moon shines at about −13, the brightest stars near 0,
        and the faintest a dark-adapted eye can catch is about +6. The band in the label says which
        filter measured it: <strong>V</strong> ("visual", roughly as the human eye sees it) for
        named stars, or Gaia's broad <strong>G</strong> for survey stars.
      </>
    ),
  },
  colourBpRp: {
    title: 'Colour (BP−RP)',
    body: (
      <>
        A star's colour is a direct readout of its surface temperature. BP−RP is its brightness
        through a <strong>B</strong>lue filter minus its brightness through a <strong>R</strong>ed
        one (BP and RP are the Gaia satellite's two colour channels). A hot star floods out more
        blue light, giving a small or negative value; a cool star glows redder, giving a large one,
        the same physics as an iron bar heating from glowing red to white-hot.
      </>
    ),
  },

  // ── Field-star derived properties (temperature / luminosity / radius) ──────
  starDerived: {
    title: 'Estimated from colour + magnitude',
    body: (
      <>
        These three figures aren't measured. They're <em>estimated</em> from the star's brightness
        and colour using published Gaia calibrations (Mucciarelli 2021 for temperature, Andrae 2018
        for the rest). They assume an ordinary star with no dust dimming it, so a reddened, distant
        star reads too cool and too large. Treat them as ballpark figures, not readings; a leading{' '}
        <code>~</code> flags a colour beyond the calibration's tested range.
      </>
    ),
  },

  // ── Famous-star measured rows (BodyDetailCard) ──────────────────────────
  constellation: {
    title: 'Constellation',
    body: (
      <>
        The constellation this star appears in from Earth. Constellations are line-of-sight
        patterns, not real groupings. The stars in one can lie at wildly different distances and
        only happen to fall along the same direction in our sky. They've served as the sky's map for
        thousands of years, and astronomers still use their 88 official boundaries to say roughly
        where an object is.
      </>
    ),
  },
  spectralType: {
    title: 'Spectral type',
    body: (
      <>
        A letter code for the star's surface temperature, running O, B, A, F, G, K, M from hottest
        to coolest. O stars are searing blue-white, M stars cool and red, and our Sun a middling G.
        The digit after the letter (0–9) fine-tunes it, and a trailing Roman numeral notes the
        star's size class. Generations of students memorise the order with "Oh Be A Fine Guy/Girl,
        Kiss Me."
      </>
    ),
  },
  stellarRadius: {
    title: 'Radius',
    body: (
      <>
        The star's size in solar radii (R☉), multiples of our Sun's radius, itself about 700,000 km.
        A value of 1 matches the Sun; a red supergiant like Betelgeuse tops 700, so vast it would
        swallow the orbits of the inner planets. Stars swell and shrink dramatically over their
        lives, so size alone doesn't reveal a star's mass or age.
      </>
    ),
  },
  stellarTemperature: {
    title: 'Temperature',
    body: (
      <>
        The temperature of the star's visible surface, in kelvin (K, degrees above absolute zero).
        This is exactly what its colour shows: cool stars around 3,000 K glow red, our Sun at about
        5,800 K looks yellow-white, and the hottest stars blaze blue-white above 30,000 K. Even so,
        the surface is far cooler than the millions of degrees hidden in the core, where the star's
        nuclear fire burns.
      </>
    ),
  },
  stellarMass: {
    title: 'Mass',
    body: (
      <>
        The star's mass in solar masses (M☉), multiples of our Sun's mass. Mass is a star's destiny:
        it sets how fiercely the star burns, how long it lives, and how it dies. Heavyweights race
        through their fuel in a few million years and end as supernovae; lightweights sip theirs and
        glow for trillions. A small difference in mass makes an enormous difference to a star's
        whole life story.
      </>
    ),
  },
  stellarLuminosity: {
    title: 'Luminosity',
    body: (
      <>
        The star's total light output, in solar luminosities (L☉), how many Suns' worth of energy it
        pours out in every direction each second. That's different from how bright it looks to us,
        which also depends on distance. A dim-looking star can be staggeringly luminous if it's
        simply far away: Rigel radiates over 100,000 Suns, yet sits some 800 light-years off.
      </>
    ),
  },
  stellarAge: {
    title: 'Age',
    body: (
      <>
        The star's age in billions of years (Gyr, "giga-years"). Our Sun is about 4.6 billion years
        old and roughly halfway through its life; the universe itself is 13.8 billion. Massive,
        bright stars are always young, since they can't live long, while small red dwarfs glimpsed
        today could outlast the present universe many times over.
      </>
    ),
  },
  variability: {
    title: 'Variability',
    body: (
      <>
        Some stars don't shine steadily. They pulse, swell, or get eclipsed by a companion, so their
        brightness rises and falls in a repeating cycle. This row names the kind of variation and
        the magnitude range it swings across. Pulsating variables like Cepheids are astronomy's
        measuring sticks: their rhythm reveals their true brightness, and comparing that with how
        bright they look hands us the distance.
      </>
    ),
  },
} as const satisfies Record<string, TipContent>;
