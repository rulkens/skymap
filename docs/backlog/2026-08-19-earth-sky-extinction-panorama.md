# Earth-sky extinction panorama

**Status:** needs-design
**Area:** Rendering / planetary-zoom sky

Spawned by the Edenhofer dust-volume grill (Q9 follow-up,
`docs/grill-sessions/edenhofer-dust-volume-2026-08-19.md`).

## Why the dust cube can't do this

The naked-eye Milky Way dark structure (Great Rift: Aquila ~250 pc, Cygnus
~600 pc; Coalsack ~180 pc; Pipe Nebula ~150 pc) is local dust and lives
inside the Edenhofer volume — but the cartesian resample's 6.5–10 pc voxels
subtend 1.5–4° at those distances, so the from-inside view is a soft blur.
The map's NATIVE product is spherical (HEALPix Nside 256 = 14′ pixels ×
radial bins, Sun-centered) — for a viewpoint at the Sun, integrating it
radially loses nothing and keeps the full 14′ angular resolution.

## The shape

- Offline: integrate the mean HEALPix cube along each sightline →
  one all-sky integrated-extinction map; convert to per-channel
  transmittance (same CCM89 ratios/R_V as the dust volume); bake to an
  equirect (or octahedral) 2D texture. Kilobytes-to-a-few-MB class.
- Runtime: at planetary zoom, multiply the sky content (star aggregate glow,
  star points via their sky direction) by the panorama — a texture lookup,
  no march. Fade band complementary to the dust volume's inner edge
  (the volume dies below ~1 pc; the panorama lives there).
- Parallax validity: exact at the Sun, fine anywhere in the inner few pc —
  gate accordingly.

## Design questions

1. What does it multiply — the swap-chain sky region, the star-aggregate
   target, or per-star attenuation by direction? (Per-star is cheap here:
   one 2D texture sample per star, and it fixes the foreground-star
   over-dimming the volume fold suffers, since from Earth almost all bright
   stars are in FRONT of almost all dust — sampling by star distance needs
   the radial dimension though; consider a small set of cumulative-depth
   panorama layers, e.g. 3–4 shells.)
2. Builder home: `tools/volumes/` beside `buildDustVolume.ts` (same fetch),
   output format (plain KTX/PNG-in-images vs a tiny new binary).
3. Interaction with the atmosphere pass at daytime (extinction only matters
   for the night sky).
