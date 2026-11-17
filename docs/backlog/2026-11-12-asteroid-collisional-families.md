# Asteroid collisional families

## Why

Most main-belt asteroids are fragments of a few hundred parent bodies broken up by collisions.
Members of a family share proper orbital elements (a, e, i averaged over secular cycles), so a
family is a visible clump in proper-element space: Vesta, Flora, Eos, Koronis, Themis, Hygiea.
Showing them would let the Layer say where the belt's asteroids came from, not just where they are.

## Data source (licence and version to check at pickup)

- **Nesvorný asteroid families**: the PDS Small Bodies Node dataset of family memberships from
  hierarchical clustering on proper elements (Nesvorný, Brož & Carruba 2015, about 120 families).
  Check for a newer release, since the owner's brief counts about 150k members, and check the PDS
  citation terms.
- Membership joins on the MPC number, the Layer's identity (spec §4.7), so no name matching is
  needed.

## What it would show

A `Colour by: family` mode: each member takes its family's tint and non-members dim. A caveat for
the design: dots sit at their osculating positions, and a family's members spread around the whole
belt within a few Myr, so in 3D a family reads as a tinted torus at its a and i, not as a clump.
Only young families (Karin, Veritas) stay clustered in space. A view drawn in proper-element axes
(a against sin i) is where families really separate; whether that view belongs in skymap is a
design question.

## Fallback for rows without data

Non-members (about four in five numbered rows) and rows newer than the catalogue keep their class
or Kirkwood-band tint, dimmed so the families stand out. The family's name could join the card's
facts.

## Cost to price

A family id per row (u16) in the build-time catalog, or a side file; a palette of about 120 tints,
too many for distinct hues, so the largest families take named colours and the rest a muted one.
