# Texture source table single home

The raw-texture nativeKey↔devFilename pairing is authored **verbatim in two
places**:

- `tools/fetch/fetchTextures.ts` `SSS_BODIES` (~lines 91–101)
- `tools/textures/buildTextures.ts` `BODY_SOURCE_KEYS` (~lines 94–108)

Fetch downloads the raws; build reads them — they must agree on every source
file, but each hand-lists it. That is an accidental mirror.

## Drift bug-class

`SSS_BODIES` is a flat array, **not** pinned to `BodyTextureId` (unlike
`BODY_SOURCE_KEYS`, which is `Record<BodyTextureId, …>`). So adding a new
textured body — a `BODY_TEXTURE_REGISTRY` row + a build entry — compiles clean
while the fetch list silently omits it: the raw never downloads, `buildTextures`
logs a skip (no source on disk), and the body renders untextured with no error.

## Un-braided shape

One `bodyId`-keyed source table both derive from — e.g. the registry rows gain
native/dev raw-data keys — with fetch and build as derived views over it.
A missing body then becomes a compile error, not a silent skip.

## Effort

Medium — care: literal-narrowing of the `RAW_DATA` upstream types (fetch relies
on `nativeKey` staying a string literal so `RAW_DATA[key]` narrows to a texture
row), the 2k dev-URL swap, and the USGS / BMNG single-row shapes.
