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

export const TIPS = {
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
} as const satisfies Record<string, TipContent>;
