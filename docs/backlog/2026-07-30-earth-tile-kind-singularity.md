# `EarthTileKind`'s plumbing assumes there is only one kind

`needs-design`

## The problem

`EarthTileKind` (`src/@types/data/EarthTileKind.d.ts`) is `Extract<TextureKind,
'surface' | 'normal'>` and its own header frames adding the normal-map path
as "a matter of instantiating a second atlas rather than rewriting the
type." The type is ready for a second member; the surrounding plumbing is
not, in four separate ways.

## Verified current state

- **The bake overwrites, it does not merge.** `buildEarthTiles.ts` writes a
  fresh `manifest.json` and `index.txt` every invocation:
  `levels: { [KIND]: { min: minLevel, max: maxLevel } }`
  (`tools/textures/buildEarthTiles.ts:270`) with `KIND` a single hardcoded
  constant (`:112`, `const KIND: EarthTileKind = 'surface'`), and
  `writeFileSync(join(outDir, 'earth-tiles/manifest.json'), ...)` /
  `writeFileSync(join(outDir, 'earth-tiles/index.txt'), ...)`
  (`:273-281`) both replace the file outright rather than reading and
  patching it. A second bake run for `'normal'` erases the `surface` entry
  from both files, and the runtime — reading `manifest.levels.surface` —
  silently stops requesting any surface tile.
- **`planEarthTiles`'s `kind` field doesn't participate in the walk.**
  `kind` is threaded through the whole function
  (`src/utils/scene/planEarthTiles.ts:70,96`) but the only place it is read
  is `requests.push({ tile: { kind, z, x, y }, screenPx })`
  (`:236`) — a tag on the output, not an input to the horizon test, the
  frustum test, or the level-selection arithmetic, all of which run
  identically regardless of kind. A second kind therefore means calling this
  function a second time per frame for a result that differs only in the
  tag stamped on each request — a second full quadtree walk for no new
  information.
- **The decode/encode path hardcodes sRGB-surface assumptions.**
  `fetchEarthTileBitmap.ts:40-45` decodes every tile with the browser's
  default colour-space conversion, paired with the `rgba8unorm-srgb` atlas —
  correct for surface albedo, wrong for a tangent-space normal map, which the
  comment itself flags ("that kind needs `colorSpaceConversion: 'none'` and
  a LINEAR atlas") without implementing the branch.
  `buildEarthTiles.ts` encodes every level as lossy WebP quality 82
  (`WEBP_QUALITY = 82`, `:88`, used at `:147` and `:233`) and averages
  coarser levels with a plain 2×2 block shrink in gamma space — both
  reasonable for colour, both wrong for packed normal-vector components. Any
  of these silently produces a corrupted normal map with no error.
- **`earthRenderer.setTileResources` has no kind parameter.**
  `setTileResources(pageTable: GPUTextureView, atlas: GPUTextureView): void`
  (`src/services/gpu/renderers/bodies/earthRenderer.ts:750`) takes one page
  table and one atlas; there is nowhere to say which kind either belongs to.
- **The uniform struct is exactly full.** `EARTH_SURFACE_UNIFORM_FLOATS = 32`
  (`src/utils/gpu/packEarthSurfaceUniforms.ts:108`) with `zWin`, `winX0`,
  `winY0` now occupying f32 29–31 — the struct's last three previously-zeroed
  pad slots (`:79-81`). A second kind's window needs three more floats, which
  is a ninth 16-byte row, not spare capacity in the current one. This is a
  hard capacity fact to plan around, not a braid to un-braid.

## Directions to explore (design decides)

The plan's own recommendation is the design escape worth starting from: have
both kinds share one window (`zWin`/`winX0`/`winY0`), since a normal map
tiled at the same pyramid would refine at the same rate as the surface
albedo it corresponds to — which would also fix the "second full quadtree
walk" cost, since one walk's window would serve both kinds. From there:

- `buildEarthTiles.ts` needs to read-modify-write `manifest.json` /
  `index.txt` (or loop over `EarthTileKind` members within one invocation)
  instead of overwriting.
- The decode/encode path needs a per-kind branch keyed off the same
  `isLinearTextureKind` axis `KIND_CFG` already uses for whole-globe
  textures, rather than a comment describing the branch that should exist.
- `setTileResources` needs either a kind parameter or to take a small
  per-kind record so the renderer can hold both bind-group resources at
  once.

## Related

`docs/superpowers/plans/2026-07-29-earth-surface-virtual-texture-a-to-d.md`
(Phase D, task D7's radar prompt names this exact risk in advance).
