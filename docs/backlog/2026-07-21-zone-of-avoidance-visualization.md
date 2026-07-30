# Zone of Avoidance visualization + tour beat

`needs-design`

## The idea

Roughly 10–20% of the sky, in a band along the Milky Way's galactic plane, is the **Zone of Avoidance (ZoA)**: dust and star crowding in our own galaxy obscure the background universe, so galaxy catalogs show a conspicuous empty stripe there. In skymap this already renders as a bare band cutting across the galaxy point cloud. The gap reads as a real void unless you know better. We want a visualization that makes the ZoA legible and a tour beat that explains it: the emptiness is an observational artifact of looking *through* the Milky Way, not an actual absence of galaxies.

## Why now

The blueshift local-volume fix (PR #474, [[project_blueshift_local_volume_placement]]) surfaced four concrete ZoA galaxies (`2MASX J00450137+5521179`, `J04000932+3726113`, `J19261464+4351036`, `J20475214+5937111`) that exist *inside* the zone: NIR-only 2MASS detections at galactic latitude |b| ≈ 7–13°, with no optical NGC/IC/PGC name and no direct distance (we seeded flow-model distances). They are perfect "galaxies hiding behind the dust" exhibits for the tour.

## Directions to explore (design decides)

- **Band overlay** — draw the galactic-plane great circle with a shaded |b| < ~10° band on the sky sphere, labelled, that the camera can reveal.
- **Density story** — a sky-density heatmap (galaxies per solid angle) that visibly dips to zero across the plane, making the deficit quantitative rather than "looks empty."
- **Dust tie-in** — reuse or preview the Milky Way dust (see the local interstellar-dust volume backlog item) so the *cause* (extinction) and the *effect* (missing galaxies) sit in the same frame.
- **Tour beat** — orbit to look along the galactic plane, show the empty stripe, then feature one or two of the seeded ZoA dwarfs to make the point that galaxies are there, just hidden.

## Open questions

- Is the visualization a persistent toggleable overlay, or tour-only choreography?
- Galactic-coordinate transform: derive from RA/Dec at build or render time? (A galactic-plane great circle is cheap to draw analytically.)
- How much of the dust-volume work does this depend on vs. a lightweight band + label standing alone?

## Related

- Milky Way dust: `backlog/2026-07-18-local-dust-volume.md`
- Tour authoring: the `tour` skill + `docs/tour/`
- Seeded ZoA dwarfs: `data/seeds/local_volume_distances.seed.json`
