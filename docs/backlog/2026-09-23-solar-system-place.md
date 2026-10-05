# The solar system hangs off the Sun; it could hang off a place

`deferred`. Raised while landing the `blackHoles` ground preparation (#811),
whose R15 ruling made the Galactic Centre a `PlaceId` so the region, the
lensing slab and R₀ key on a location rather than on the object sitting there.
The solar system is the same shape with the same object-at-the-origin
coupling still in place.

## What is true today

- `src/data/bodies/orbitalElements.ts` — eleven element rows carry
  `focusId: 'sun'`. The elements are heliocentric J2000 Keplerian sets, so the
  Sun is their true focus, not a stand-in.
- `src/data/bodies/bodyRegions.ts:23,66,116-117` — `SUN_ID = 'sun'` anchors
  both `solar-system` and `solar-neighbourhood`, and `anchoredMemberIds(SUN_ID)`
  gathers the planet subtree from the body id.
- `src/data/bodies/sceneAnchors.ts` — the Sun's anchor is its seed row
  (`SUN_GENERATED`, distance 0 → `[0, 0, 0]`). The header already refuses to
  alias that coordinate to `RENDER_ORIGIN_MPC`: the Sun's position and the
  frame's origin are different facts that share a value.
- `src/@types/scene/PlaceId.d.ts` — one member, `'galactic-centre'`.

So every structural reader of "the solar system" depends on the Sun's body
id, exactly as every reader of the galactic centre depended on `sgr-a-star`
before #811.

## The shape

A second `PlaceId` member, `'solar-system'`, positioned at the heliocentre:

- `SOLAR_SYSTEM_ANCHOR` in `src/data/places/`, `positionMpc` `[0, 0, 0]` —
  its own array, not the render origin's (the same reasoning as the
  `sceneAnchors.ts` header).
- The Sun's anchor row aliases the place's array by reference, never a second
  coordinate (the pattern `SGR_A_STAR_ALIAS` used until #825 deleted it).
- The eleven element rows and both regions re-key from `'sun'` to
  `'solar-system'`; `deriveBodyStates` carries a `'solar-system'` state like
  it carries `'galactic-centre'` today.

Name it for what it holds. The elements are heliocentric, so the place IS the
heliocentre; `'solar-system-barycentre'` would be a place lying about its own
value. The barycentre (the Sun's ~1 R☉ wobble, mostly Jupiter) is a separate
feature: barycentric elements for every row plus an orbit for the Sun's alias
instead of a shared array. This item makes that feature a data change instead
of a re-anchoring, but does not do it.

## Why deferred

No reader needs the decoupling yet. The Sun's anchor row stays in core with
the other seeded stars, so there is no dependency inversion to fix — unlike
Sgr A*, whose whole body row leaves core in the `blackHoles` feature PR. Until
one of these arrives, the place is a second `[0, 0, 0]` with no reader:

- a barycentric ephemeris (the Sun wobbles; the place and the Sun diverge);
- a moving render origin (`renderOrigin.ts` flags it) — though that is a frame
  concern and may not want an anchor at all;
- the seeded stars leaving the body tables
  (`2026-09-22-stars-still-in-the-body-tables.md`), which would move the Sun's
  anchor out of core and make `bodyRegions`' dependency on `'sun'` an inversion.

Sequence after `2026-09-22-scene-anchors-are-places.md` — whether
`SCENE_ANCHORS` is the place table decides where `SOLAR_SYSTEM_ANCHOR` lives.
