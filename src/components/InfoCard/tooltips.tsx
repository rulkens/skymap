/**
 * tooltips.tsx — glossary content for InfoCard's InfoTip icons.
 *
 * Skymap is an outreach tool, so every tip is written to teach a curious
 * non-astronomer something true and memorable — the *why* behind the number,
 * with a concrete anchor to hold onto (the Sun's magnitude, a parsec in
 * light-years, the full Moon's brightness) — not just to define the jargon.
 * Bodies are JSX so they can carry line breaks, italics, and `<code>`.
 */

import type { TipContent } from '../../@types/components/infoCard/TipContent';

export const TIPS: Record<string, TipContent> = {
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
  diameter: {
    title: 'Physical diameter',
    body: (
      <>
        The galaxy's true size across its visible disk, in kiloparsecs (kpc, thousands of parsecs)
        and thousands of light-years. Our own Milky Way spans roughly 30 kpc for comparison. When a
        catalog hasn't measured a galaxy's size directly, we estimate it from its brightness via the
        Tully size–luminosity relation (brighter galaxies tend to be bigger). The provenance line
        under the value says which method this row used.
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
  bodyRadius: {
    title: 'Radius',
    body: (
      <>
        The physical radius of this world: the straight-line distance from its centre to its
        surface, in kilometres. For scale, Earth's radius is about 6,400 km and Jupiter's is roughly
        11 times larger. Because doubling a radius makes a body eight times the volume, the giant
        planets dwarf the rocky ones far more than their radii alone let on.
      </>
    ),
  },
  bodyMass: {
    title: 'Mass',
    body: (
      <>
        How much matter this world holds. We show planets in Earth masses (M⊕), where Jupiter is 318
        of them, and tiny moons in kilograms. Nobody puts a planet on a scale: its mass is read from
        the pull it exerts, seen in how its moons orbit or how it tugs a passing spacecraft. Mass
        rules a world's gravity, whether it can hold an atmosphere, and whether it stays a ball or
        gets squashed.
      </>
    ),
  },
  bodyGravity: {
    title: 'Surface gravity',
    body: (
      <>
        How hard this world pulls at its surface, given as a multiple of Earth's gravity (g). At{' '}
        <code>1 g</code> you weigh what you weigh at home; at Mars's <code>0.38 g</code> you'd weigh
        a third as much and could nearly leap over a car; on the Moon's <code>0.17 g</code> the
        Apollo astronauts bounced. It depends on both mass and size: a small dense world can
        out-pull a big fluffy one.
      </>
    ),
  },
  bodyDayLength: {
    title: 'Day length',
    body: (
      <>
        How long this world takes to spin once, which is its day. Earth turns in 24 hours, Jupiter
        in under 10, but Venus is so sluggish (and spinning <em>backwards</em>) that its day
        outlasts its year. Most large moons are "tidally locked", turning exactly once per orbit so
        they keep one face toward their planet forever, which is why we only ever see one side of
        our own Moon.
      </>
    ),
  },
  bodyYearLength: {
    title: 'Orbital period',
    body: (
      <>
        How long one full trip around takes: around the Sun for a planet, around its planet for a
        moon. Kepler's law is the rule: the farther out you orbit, the slower you go and the longer
        the lap. Mercury races round the Sun in 88 days while Neptune plods through a single orbit
        for 165 <em>years</em>, so nobody alive has watched it complete one since its discovery.
      </>
    ),
  },
  bodyDistance: {
    title: 'Orbital distance',
    body: (
      <>
        How far this world sits from what it orbits. Planets are measured from the Sun in
        astronomical units (AU): <code>1 AU</code> is the Earth–Sun distance, about 150 million km,
        far enough that sunlight, at 300,000 km/s, still takes 8 minutes to reach us. Moons are
        measured from their own planet in kilometres, since an AU would dwarf their tight little
        orbits.
      </>
    ),
  },
  bodyMeanTemp: {
    title: 'Mean temperature',
    body: (
      <>
        The average temperature across this world's surface. Distance from the Sun isn't the whole
        story: Venus sits farther out than Mercury yet roasts hotter: 464 °C, hot enough to melt
        lead. Its thick carbon-dioxide blanket traps heat in a runaway greenhouse, while airless
        Mercury dumps its heat straight back to space. An atmosphere can matter more than sunlight.
      </>
    ),
  },
  bodyMoons: {
    title: 'Moons',
    body: (
      <>
        How many natural satellites orbit this planet. Earth has just one; the giant planets herd
        dozens, from world-sized moons down to captured chips of rock, and Saturn's confirmed tally
        now runs past 140. The count keeps climbing as sharper surveys pick out ever-fainter specks,
        so read it as "known so far", not a final number.
      </>
    ),
  },
  bodyAxialTilt: {
    title: 'Axial tilt',
    body: (
      <>
        How far this world's spin axis leans from upright relative to its orbit, the reason seasons
        exist. Earth's <code>23.4°</code> tilt swings each hemisphere toward and away from the Sun
        through the year, giving us summer and winter. Uranus is tipped right over at 98°, rolling
        on its side so its poles bake and freeze through decades-long seasons.
      </>
    ),
  },
  bodyAtmosphere: {
    title: 'Atmosphere',
    body: (
      <>
        The blanket of gas a world holds onto, and what it's made of. Small, warm, low-gravity
        bodies can't keep one and end up airless like Mercury and the Moon; the giants clung to
        hydrogen and helium straight from the Sun's own recipe. A planet's air shapes everything a
        visitor would feel: its temperature, its weather, its sky colour, and whether life could
        breathe.
      </>
    ),
  },
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
};
