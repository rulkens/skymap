/**
 * tooltips.tsx — glossary content for InfoCard's InfoTip icons.
 *
 * Skymap is an outreach tool, so every tip is written to teach a curious
 * non-astronomer something true and memorable — the *why* behind the number,
 * with a concrete anchor to hold onto (the Sun's magnitude, a parsec in
 * light-years, the full Moon's brightness) — not just to define the jargon.
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
        How far this galaxy lies from us. The numbers are so vast that astronomers switch to the
        parsec (pc): one parsec is 3.26 light-years, and a light-year is simply how far light
        travels in a year — about 6 trillion miles. Galaxies run to millions of parsecs, so you'll
        see megaparsecs (Mpc). We show light-years alongside because that's the unit most people
        picture; the slash just means "same distance, said two ways."
      </>
    ),
  },
  hubbleVelocity: {
    title: 'Recession velocity',
    body: (
      <>
        How fast the gap between us and this galaxy is widening as space itself expands. Almost
        every galaxy is rushing away, and the farther one sits, the faster it goes — the fingerprint
        of an expanding universe that Lemaître and Hubble uncovered in the 1920s. The rule is just{' '}
        <code>v = H₀ × d</code>, with H₀ ≈ 70 km/s per megaparsec. Far enough out, this speed{' '}
        <em>exceeds light</em> — which is allowed, because space is stretching; nothing is racing{' '}
        <em>through</em> it.
      </>
    ),
  },
  lookback: {
    title: 'Lookback time',
    body: (
      <>
        Light isn't instant — it takes time to cross space, so we always see distant things as they{' '}
        <em>were</em>. Sunlight reaches us already 8 minutes old; this galaxy's light has been on
        the way far longer, so you're seeing it as it looked that many years ago, not today. The
        real galaxy has kept aging, reddening, and drifting farther off in the meantime. Looking out
        into space is literally looking back in time.
      </>
    ),
  },
  earthEra: {
    title: 'Earth era',
    body: (
      <>
        A way to <em>feel</em> how long this galaxy's light has been travelling: what was happening
        on Earth when it set out. If it left during the age of the dinosaurs, that ancient light is
        what's landing in your eye right now. Billions of years are almost impossible to picture —
        pinning them to Earth's own story makes the distance real.
      </>
    ),
  },
  ra: {
    title: 'Right ascension',
    body: (
      <>
        Where the galaxy sits east-to-west on the sky — the sky's version of longitude. Just as
        every place on Earth has a longitude, every star and galaxy has a right ascension, so anyone
        can aim a telescope at the same spot. It's counted in hours, minutes and seconds (0h to 24h)
        because the sky appears to wheel around once a day, like a giant clock. We show the
        plain-degrees version (0° to 360°) beside it.
      </>
    ),
  },
  dec: {
    title: 'Declination',
    body: (
      <>
        Where the galaxy sits north-to-south on the sky — the sky's version of latitude. It runs
        from +90° at the north celestial pole (straight above Earth's North Pole), through 0° at the
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
        (longer-wavelength) end of the spectrum — redshift measures how much. The formula{' '}
        <code>
          z = (λ<sub>obs</sub> − λ<sub>rest</sub>) / λ<sub>rest</sub>
        </code>{' '}
        just compares the wavelength we receive with the one the galaxy emitted; a z of 1 means the
        waves arrived twice as long as they left. Bigger z means farther away and further back in
        time — it's cosmology's tape measure.
      </>
    ),
  },
  apparentMag: {
    title: 'Apparent magnitude',
    body: (
      <>
        How bright the galaxy <em>looks</em> from Earth. The scale is a 2,000-year-old ranking from
        the Greek astronomer Hipparchus, who called the brightest stars "first magnitude" and the
        faintest "sixth" — so it runs <em>backwards</em>: smaller numbers mean brighter. It's also
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
        misleads us because nearer things look brighter — absolute magnitude strips that away to
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
        a bluer one (e.g. <code>g − r</code>) — the same idea as judging a heated iron bar by
        whether it glows red, orange or white. Hot, young, star-forming galaxies lean blue (small or
        negative values); old galaxies full of cool red stars lean red (large values). So this one
        figure reveals a galaxy's stellar age without resolving a single star.
      </>
    ),
  },
  diameter: {
    title: 'Physical diameter',
    body: (
      <>
        The galaxy's true size across its visible disk, in kiloparsecs (kpc — thousands of parsecs)
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
        outline looks — <code>1.0</code> is a perfect circle (face-on, like looking down at a
        plate), <code>0.2</code> is a thin sliver (edge-on, the plate seen from the side).{' '}
        <strong>PA</strong> (position angle) is the compass direction of its long axis, in degrees
        measured east of north. Together they let us tilt the on-screen billboard to match the real
        galaxy.
      </>
    ),
  },

  // ── Structure rows (cluster / supercluster / void / group) ──────────────
  structureDistance: {
    title: 'Distance',
    body: (
      <>
        How far the centre of this structure lies from us, in parsecs and light-years. It's the
        distance to the catalogued middle — the individual member galaxies are strewn through a huge
        volume, some nearer and some farther than this single figure. Think of it as the address of
        the group's heart, not a wall at a fixed range.
      </>
    ),
  },
  structureRadius: {
    title: 'Radius',
    body: (
      <>
        The structure's physical reach: the radius of the sphere we treat as its territory, and the
        size of the ring drawn around it on the sky. It's a radius (centre to edge), not a diameter,
        so the full span across is twice this. Clusters of galaxies run to millions of light-years —
        the largest structures gravity has managed to bind together.
      </>
    ),
  },
  memberCount: {
    title: 'Member galaxies',
    body: (
      <>
        How many catalogued galaxies currently fall inside this structure's sphere — with the tiers
        and catalogs you have switched on right now. Load a deeper tier or enable more surveys and
        this climbs, because you're revealing more of the same real population, not creating new
        galaxies. Read it as "how many we can show you here," not the true head-count, which is far
        larger.
      </>
    ),
  },
  abell: {
    title: 'Abell designation',
    body: (
      <>
        The cluster's ID in the Abell catalogue, the classic 1958 census of rich galaxy clusters
        compiled by George Abell (extended to the southern sky in 1989). Abell hunted them by eye on
        photographic plates — a monumental effort long before computers could help. For example,{' '}
        <code>A1656</code> is the famous Coma Cluster.
      </>
    ),
  },

  // ── Field-star catalogued rows ──────────────────────────────────────────
  starDistance: {
    title: 'Distance',
    body: (
      <>
        How far this star lies from us, in parsecs (pc). One parsec is 3.26 light-years — the
        distance at which Earth's whole orbit would look just one arcsecond wide, which is where the
        odd name comes from ("parallax-second"). Even the nearest star beyond the Sun, Proxima
        Centauri, sits 1.3 pc away — about 4.2 light-years, or 25 trillion miles. Space is far
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
        magnitude is 4.83 — a useful yardstick. Remember the scale runs backwards: the smaller (or
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
        filter measured it — <strong>V</strong> ("visual", roughly as the human eye sees it) for
        named stars, or Gaia's broad <strong>G</strong> for survey stars.
      </>
    ),
  },
  colourBpRp: {
    title: 'Colour (BP−RP)',
    body: (
      <>
        A star's colour is a direct readout of its surface temperature. BP−RP is literally its
        brightness through a <strong>B</strong>lue filter minus its brightness through a{' '}
        <strong>R</strong>ed one (BP and RP are the Gaia satellite's two colour channels). A hot
        star floods out more blue light, giving a small or negative value; a cool star glows redder,
        giving a large one — the very same physics as an iron bar heating from red to orange to
        white. So this single number sorts stars from scorching blue to cool red.
      </>
    ),
  },

  // ── Field-star derived properties (temperature / luminosity / radius) ──────
  starDerived: {
    title: 'Estimated from colour + magnitude',
    body: (
      <>
        These three figures aren't measured — they're <em>estimated</em> from the star's brightness
        and colour using published Gaia calibrations (Mucciarelli 2021 for temperature, Andrae 2018
        for the rest). They assume an ordinary star with no dust dimming it, so a reddened, distant
        star reads too cool and too large. Treat them as ballpark figures, not readings — a leading{' '}
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
        patterns, not real groupings — the stars in one can lie at wildly different distances and
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
        A letter code for the star's surface temperature, running O–B–A–F–G–K–M from hottest to
        coolest. O stars are searing blue-white, M stars cool and red, and our Sun a middling G. The
        digit after the letter (0–9) fine-tunes it, and a trailing Roman numeral notes the star's
        size class. Generations of students memorise the order with "Oh Be A Fine Guy/Girl, Kiss
        Me."
      </>
    ),
  },
  stellarRadius: {
    title: 'Radius',
    body: (
      <>
        The star's size in solar radii (R☉) — multiples of our Sun's radius, itself about 700,000
        km. A value of 1 matches the Sun; a red supergiant like Betelgeuse tops 700, so vast it
        would swallow the orbits of the inner planets. Stars swell and shrink dramatically over
        their lives, so size alone doesn't reveal a star's mass or age.
      </>
    ),
  },
  stellarTemperature: {
    title: 'Temperature',
    body: (
      <>
        The temperature of the star's visible surface, in kelvin (K — degrees above absolute zero).
        This is exactly what its colour shows: cool stars around 3,000 K glow red, our Sun at about
        5,800 K looks yellow-white, and the hottest stars blaze blue-white above 30,000 K. Even so,
        the surface is far cooler than the millions of degrees hidden in the core, where the star's
        nuclear fire actually burns.
      </>
    ),
  },
  stellarMass: {
    title: 'Mass',
    body: (
      <>
        The star's mass in solar masses (M☉) — multiples of our Sun's mass. Mass is a star's
        destiny: it sets how fiercely the star burns, how long it lives, and how it dies.
        Heavyweights race through their fuel in a few million years and end as supernovae;
        lightweights sip theirs and glow for trillions. A small difference in mass makes an enormous
        difference to a star's whole life story.
      </>
    ),
  },
  stellarLuminosity: {
    title: 'Luminosity',
    body: (
      <>
        The star's total light output, in solar luminosities (L☉) — how many Suns' worth of energy
        it pours out in every direction each second. That's different from how bright it looks to
        us, which also depends on distance. A dim-looking star can be staggeringly luminous if it's
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
        bright stars are always young — they simply can't live long — while small red dwarfs
        glimpsed today could outlast the present universe many times over.
      </>
    ),
  },
  variability: {
    title: 'Variability',
    body: (
      <>
        Some stars don't shine steadily — they pulse, swell, or get eclipsed by a companion, so
        their brightness rises and falls in a repeating cycle. This row names the kind of variation
        and the magnitude range it swings across. Pulsating variables like Cepheids are astronomy's
        measuring sticks: their rhythm reveals their true brightness, and comparing that with how
        bright they look hands us the distance.
      </>
    ),
  },

  // ── Body rows (planets / moons) + galaxy morphology / AGN ───────────────
  bodyRadius: {
    title: 'Radius',
    body: (
      <>
        The physical radius of this world — the straight-line distance from its centre to its
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
        How much matter this world holds. We show planets in Earth masses (M⊕) — Jupiter is 318 of
        them — and tiny moons in kilograms. Nobody puts a planet on a scale: its mass is read from
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
        Apollo astronauts bounced. It depends on both mass and size — a small dense world can
        out-pull a big fluffy one.
      </>
    ),
  },
  bodyDayLength: {
    title: 'Day length',
    body: (
      <>
        How long this world takes to spin once — its day. Earth turns in 24 hours, Jupiter in under
        10, but Venus is so sluggish (and spinning <em>backwards</em>) that its day outlasts its
        year. Most large moons are "tidally locked", turning exactly once per orbit so they keep one
        face toward their planet forever — which is why we only ever see one side of our own Moon.
      </>
    ),
  },
  bodyYearLength: {
    title: 'Orbital period',
    body: (
      <>
        How long one trip around takes — around the Sun for a planet, around its planet for a moon.
        Kepler's law is the rule: the farther out you orbit, the slower you go and the longer the
        lap. Mercury races round the Sun in 88 days while Neptune plods through a single orbit for
        165 <em>years</em> — so nobody alive has watched it complete one since its discovery.
      </>
    ),
  },
  bodyDistance: {
    title: 'Orbital distance',
    body: (
      <>
        How far this world sits from what it orbits. Planets are measured from the Sun in
        astronomical units (AU): <code>1 AU</code> is the Earth–Sun distance, about 150 million km —
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
        story: Venus sits farther out than Mercury yet roasts hotter — 464 °C, hot enough to melt
        lead — because its thick carbon-dioxide blanket traps heat in a runaway greenhouse, while
        airless Mercury dumps its heat straight back to space. An atmosphere can matter more than
        sunlight.
      </>
    ),
  },
  bodyMoons: {
    title: 'Moons',
    body: (
      <>
        How many natural satellites orbit this planet. Earth has just one; the giant planets herd
        dozens, from world-sized moons down to captured chips of rock — Saturn's confirmed tally now
        runs past 140. The count keeps climbing as sharper surveys pick out ever-fainter specks, so
        read it as "known so far", not a final number.
      </>
    ),
  },
  bodyAxialTilt: {
    title: 'Axial tilt',
    body: (
      <>
        How far this world's spin axis leans from upright relative to its orbit — the reason seasons
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
        visitor would feel — its temperature, its weather, its sky colour, and whether life could
        breathe.
      </>
    ),
  },
  morphology: {
    title: 'Morphological type',
    body: (
      <>
        A galaxy's morphological type is its shape, sorted by Edwin Hubble's classic scheme:
        ellipticals (smooth balls of old stars), spirals (flat disks with winding arms), and barred
        spirals (with a straight bar of stars across the centre). The Milky Way is a barred spiral.
        Shape isn't just looks — it traces how a galaxy formed and whether it's still building new
        stars in its arms.
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
        furiously the black hole is feeding. They rank among the most luminous — and most distant —
        objects we can see.
      </>
    ),
  },
};
