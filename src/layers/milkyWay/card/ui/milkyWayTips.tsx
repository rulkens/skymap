/**
 * milkyWayTips — glossary content for the Milky Way detail card's InfoTip icons.
 * Typed keys, not Record<string, …>, so the card reads them without `!`.
 */

import type { TipContent } from '../../../../@types/components/infoCard/TipContent';

export const MILKY_WAY_TIPS = {
  morphology: {
    title: 'Morphological type',
    body: (
      <>
        A galaxy's morphological type is its shape, sorted by Edwin Hubble's classic scheme:
        ellipticals (smooth balls of old stars), spirals (flat disks with winding arms), and barred
        spirals (with a straight bar of stars across the centre). The Milky Way is a barred spiral.
        The shape traces how a galaxy formed and whether it's still building new stars in its arms.
      </>
    ),
  },
  sunToCentre: {
    title: 'Sun to galactic centre',
    body: (
      <>
        How far the Sun sits from the Milky Way's own centre, out in one of the disc's spiral arms
        rather than anywhere near the middle. Astronomers call this figure R₀. It's measured by
        tracking the orbits of stars right at the centre, tugged by the black hole sitting there,
        and working out our own distance from that orbit's geometry.
      </>
    ),
  },
  milkyWayStars: {
    title: 'Star count',
    body: (
      <>
        Roughly how many stars make up the Milky Way. Nobody has ever counted them one by one; the
        range comes from totalling the galaxy's light and mass and dividing by a typical star's
        share of each. Most are small, dim red dwarfs invisible to the naked eye, so the number
        dwarfs anything you can actually see in the night sky.
      </>
    ),
  },
  milkyWayMass: {
    title: 'Mass',
    body: (
      <>
        The stellar figure is just the stars added up, weighed by how their light and motions
        behave. The much larger figure includes dark matter: an invisible, undetected-directly
        substance that outweighs the visible galaxy several times over. We know it's there because
        stars far out in the disc orbit too fast for the visible mass alone to hold onto them.
      </>
    ),
  },
  oldestStars: {
    title: 'Oldest stars',
    body: (
      <>
        The age of the Milky Way's most ancient stars, found in its halo and globular clusters
        rather than the busy star-forming disc. This figure sits close to the age of the universe
        itself (13.8 billion years), meaning the Milky Way started forming almost as soon as stars
        became possible at all.
      </>
    ),
  },
  galacticYear: {
    title: 'Galactic year',
    body: (
      <>
        How long the Sun takes to complete one full orbit of the galactic centre: one "galactic
        year". At roughly 220 million of our years per lap, the Sun has circled the Milky Way only
        about 20 times since it formed, even though it orbits at 229 km/s, far faster than any
        spacecraft humanity has built.
      </>
    ),
  },
  centralBlackHole: {
    title: 'Central black hole',
    body: (
      <>
        Sagittarius A* (Sgr A*) is the supermassive black hole anchoring the Milky Way's centre,
        weighing in at about 4.3 million Suns. Astronomers tracked individual stars whipping around
        it for decades to pin down that mass, work that won the 2020 Nobel Prize in Physics. It's
        quiet compared to actively-feeding black holes elsewhere, so it doesn't light up the sky.
      </>
    ),
  },
} as const satisfies Record<string, TipContent>;
