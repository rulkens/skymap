# surfaceHorizon: the horizon bake

Bakes per-post horizon angles (16 sectors, 33 × 33 posts per tile) from a body's height archives.
Spec: `docs/superpowers/specs/2026-11-25-terrain-horizon-shadows-design.md` §3–§4, §7.

```
npm run bake-horizon -- --body earth|moon|mars [--band <i>] [--workers N]
```

- **Order:** height bake, then horizon, then pack. The tool packs the horizon archives itself, so
  there is no separate `--pack-only` step. A height re-bake means re-baking horizon over the changed
  area grown by the march radius (about 12° of arc), because the prefix pins the height build.
- **`--band`** indexes `manifest.json`'s `bands`. Without it every band bakes. `--workers` defaults
  to cores − 1; each worker holds up to about 100 MB of decoded height tiles.
- **Resume:** a tile whose `horizon/<z>/<x>/<y>.webp` exists is skipped; writes are atomic.
- **Output:** `<prefix>/horizon/<z>/<x>/<y>.webp` (66 × 66 lossless RGBA, `exact` so a lit sector's
  alpha 0 keeps its colour channels), a zero-byte file for a flat tile. Then `index.txt`, the
  `horizon` archives and `builtFrom.horizon` (`sourceId: 'derived:height'`) are written, manifest last.
- **Missing heights:** a read falls back to the deepest ancestor with the tile (Mars z9 lands on z7).
  Where no level has it, the height and the ceiling read 0 m.
- **Globe images:** when a tier's whole source level is baked (small z4, medium z5, large z6) the tool
  writes `public/data/images/textures/<body>-horizon-<px>.webp`. The name carries the tier's nominal
  px (2048/4096/8192) but the image is half that wide (1024/2048/4096): posts, not texels, are the
  tier's resolution. The scheme is kept, not renamed.
- **Cost:** about 1 s per tile per thread, plus re-marches while far-field height tiles decode.
