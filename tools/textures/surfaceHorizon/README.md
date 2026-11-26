# surfaceHorizon: the horizon bake

Bakes per-post horizon angles (16 sectors, 129 × 129 posts per tile) from a body's height archives.
Spec: `docs/superpowers/specs/2026-11-25-terrain-horizon-shadows-design.md` §3–§4, §7.

```
npm run bake-horizon -- --body earth|moon|mars [--band <i>] [--workers N]
```

- **Order:** height bake, then horizon, then pack. The tool packs the horizon archives itself, so
  there is no separate `--pack-only` step. A height re-bake means re-baking horizon over the changed
  area grown by the march radius (about 12° of arc), because the prefix pins the height build.
- **Levels:** a band's horizon runs two levels above its heights (`[min − 2, max − 2]`). Tile z is
  baked as its 16 sub-tiles at z + 2, each a 33-post march, and assembled; where a sub-tile has no
  heights of its own (around a regional band) its reads fall back to coarser levels. The manifest
  gets one `horizon` row per height band at those levels; the height rows carry no `horizon`.
- **`--band`** indexes `manifest.json`'s bands with heights. Without it every band bakes. `--workers` defaults
  to cores − 1; each worker holds up to about 100 MB of decoded height tiles.
- **Resume:** a tile whose `horizon/<z>/<x>/<y>.webp` exists is skipped; writes are atomic. The
  skip cannot tell an older tile format apart, so clear `<prefix>/horizon/` before a re-bake that
  changes it; `index.txt` horizon lines whose file is gone are dropped.
- **Output:** `<prefix>/horizon/<z>/<x>/<y>.webp` (258 × 258 lossless RGBA, `exact` so a lit sector's
  alpha 0 keeps its colour channels), a zero-byte file for a flat tile. Then `index.txt`, the
  `horizon` archives and `builtFrom.horizon` (`sourceId: 'derived:height'`) are written, manifest last.
- **Missing heights:** a read falls back to the deepest ancestor with the tile (Mars z9 lands on z7).
  Where no level has it, the height and the ceiling read 0 m.
- **Globe images:** when a tier's whole source level is baked (small z2, medium z3, holding the
  posts of z4 and z5) the tool writes
  `public/data/images/textures/<body>-horizon-<px>.webp`. The name carries the tier's nominal px
  (2048/4096) but the image is half that wide (1024/2048): posts, not texels, are the tier's
  resolution. The scheme is kept, not renamed. There is no large image: the horizon kind is capped
  at medium on every body, since surface tiles take over up close. The Moon's measure 1.4 and 6.0 MB.
- **Cost:** about 0.2–0.3 s per tile per thread on the Moon (z3–z7, measured 2026-11-26), far-field
  decodes and the re-marches they cause included; only a march that read an undecoded tile re-runs.
