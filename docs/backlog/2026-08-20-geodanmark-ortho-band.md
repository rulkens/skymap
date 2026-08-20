# GeoDanmark orthophoto as a deeper Earth-tile band (z14–z19, Søndermarken)

**Goal.** Extend the powers-of-ten Earth zoom below the EOX band's z13 floor (~9.5 m/px N–S at 55.7°N) with Danish national aerial orthophoto (10–12.5 cm GSD, CC BY 4.0) over a small Frederiksberg/Søndermarken patch — the next rungs toward the ground-level photogrammetry endgame. Written as a handoff to the agent that owns the multi-region EOX pipeline (worktree `powers-of-ten-earth-zoom`, branch `eox-tile-prefix-v3`); all file references below are to that branch's tree.

## The data source

- **Product:** GeoDanmark Ortofoto (forår) — national spring flight, 4-channel RGBNir source, 12.5 cm/px standard, 10 cm where the municipality opted in (Frederiksberg/Copenhagen likely; confirm, but it only changes sharpness at the deepest level, nothing structural). Updated annually; 2025 vintage is live.
- **License:** CC BY 4.0 under Klimadatastyrelsen's "frie geografiske data" terms — same regime as our EOX credit. Attribution string of the form "Ortofoto © GeoDanmark / Klimadatastyrelsen (CC BY 4.0)". Harvest-to-R2 is fine (unlike Google's 3D tiles, which were evaluated and rejected on no-caching terms).
- **Access:** Datafordeleren, **API-key** auth (free registration via Datafordeler Administration). The apikey services are the _modernized_ ones that survive the platform's 2026/2027 legacy phase-out; only username/password endpoints die.
  - WMS: `https://services.datafordeler.dk/GeoDanmarkOrto/orto_foraar/1.0.0/WMS?apikey=…`
  - WMTS (Web Mercator): `https://wmts.datafordeler.dk/GeoDanmarkOrto/orto_foraar_webm/1.0.0/WMTS?apikey=…`, layer `orto_foraar_webm`, matrix set `DFD_GoogleMapsCompatible`, JPEG
  - WMTS (native): EPSG:25832 (UTM32/ETRS89) matrix set

## The one architectural decision (resolve before spec)

Skymap's tile ladder is **WGS84 geographic** — `tileDeg = 180/2^z`, the identity `eoxTileSource.ts`'s header depends on. GeoDanmark's WMTS grids are EPSG:3857 or EPSG:25832 — **neither matches**, so the EOX "harvest their tiles, composite by index" pattern does not transfer as-is. Two options:

1. **WMS GetMap harvest onto our own grid (recommended).** WMS serves arbitrary CRS/bbox: request each skymap-grid tile directly as `CRS=EPSG:4326`, `WIDTH=HEIGHT=256`, `BBOX=<tile bounds>`, `FORMAT=image/jpeg`. The server does the reprojection; the raw store lands already on our ladder and `readBox` stays simple composite math like EOX's. Cost: WMS is ~10× slower per request than WMTS — irrelevant for a one-time ~6k-tile harvest at 2 req/s. **Landmine:** WMS 1.3.0 + EPSG:4326 means **lat,lon axis order** in BBOX (1.1.1 is lon,lat) — get this wrong and you harvest the Gulf of Aden.
2. WMTS harvest (fast, native grid) + our own reprojection at bake time — only worth it if the spike finds WMS won't serve EPSG:4326 or output quality is degraded.

**Spike (gates the spec):** register an apikey → `GetCapabilities` on the WMS → confirm EPSG:4326 GetMap support, the current-vintage layer name, and deepest usable GSD; one test GetMap over Søndermarken to verify axis order and image quality. Also check the 10 cm coverage layer for Frederiksberg.

## Band geometry

- **Patch:** Søndermarken + immediate surroundings, e.g. `{ west: 12.51, south: 55.662, east: 12.55, north: 55.678 }` (~2.5 × 1.8 km, nested inside the existing `copenhagen` EOX bbox). Deliberately tiny: the full EOX Copenhagen bbox at z19 would be ~5M tiles; this patch is ~5.5k at z19 (~150–200 MB JPEG).
- **Depth:** harvest **z19 only** (≈0.149 m/px N–S, 0.084 m/px E–W at this latitude — right at the 10–12.5 cm source floor; z20 would just upsample). Bake derives z14–z18 by the existing 2×2 averaging, exactly as EOX derives z8–z12 from its z13 harvest.
- **Band:** `GEODANMARK_MIN_LEVEL = 14` — one deeper than the EOX band's max, mirroring `EOX_MIN_LEVEL = 8` = BMNG max + 1.

## Implementation map (mirrors the EOX pattern file-for-file)

| Piece          | EOX precedent                                                       | GeoDanmark analogue                                                                                                                                                                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fetcher        | `tools/fetch/fetchEoxTiles.ts` (`npm run fetch-eox`)                | `tools/fetch/fetchGeoDanmarkTiles.ts` — reuse the throttle (500 ms), resume-by-file-existence, retryable-status classification, and never-write-non-image-bytes guards. New surface: apikey injection (the EOX `EoxTileTransport` is a bare `fetch(url)` with no auth seam) and **redact the key from any logged/thrown URL** |
| Region table   | `tools/fetch/eoxRegions.ts`                                         | `GEODANMARK_REGIONS = { sondermarken: {...} }`, same `EoxBbox` shape                                                                                                                                                                                                                                                          |
| Raw store      | `data/raw/eox/<region>/13/<row>/<col>.jpg`                          | `data/raw/geodanmark/<region>/19/<row>/<col>.jpg` — same WGS84 z/row/col convention if option 1 wins                                                                                                                                                                                                                          |
| Registry       | `'eox.dir'` / `'eox.readme'` in `tools/utils/io/rawDataRegistry.ts` | `'geodanmark.dir'` (gitignored) + `'geodanmark.readme'` (committed provenance README: endpoint, vintage, fetch date, license)                                                                                                                                                                                                 |
| Imagery source | `tools/textures/eoxTileSource.ts` (`EarthImagerySource`)            | `geoDanmarkTileSource.ts` — same per-region discovery/coverage/`readBox`; provenance `{ sourceId: 'geodanmark-orto-foraar-2025', attribution: …, vintage: '2025' }`                                                                                                                                                           |
| Bake wiring    | bands array in `tools/textures/buildEarthTiles.ts` `main()`         | third entry `{ source: geoDanmark, minLevel: 14, underfill: eox }` — underfill from the EOX source so partial 2×2 composites at the patch edge stay opaque (precedent: BMNG underfills EOX above its own max level). `--only geodanmark-…` (PR #596) gives the fast re-bake loop                                              |
| Runtime        | —                                                                   | **No `src/` changes.** The manifest's `levels.surface` band array + `derivePlannerParams` already support N bands; verify visually that the nested band (patch-inside-patch) plans/refines sanely                                                                                                                             |
| R2             | `earth-tiles/index.txt`-driven sync                                 | zero deploy-tooling changes; standard `TILE_PREFIX` rule — bump if the current prefix has already been synced (tiles are immutable, never purged)                                                                                                                                                                             |
| Secret         | keychain → `process.env` pattern (`syncR2Secure.sh`)                | `process.env.DATAFORDELER_API_KEY`, read directly à la `purgeCloudflareCache.ts`; throw with setup hint if unset. Never `.env.production` (committed + bundle-inlined), no dotenv dep                                                                                                                                         |

## Docs & credits (same PR)

- `ATTRIBUTIONS.md`: new GeoDanmark/Klimadatastyrelsen section (CC BY 4.0 + attribution string). While there: the EOX section still says "Copenhagen-centre patch" — stale since the multi-region harvest.
- `docs/DATA.md`: refresh-order table row (`fetch-geodanmark` → `build-earth-tiles`) + the new-source checklist items above.
- Note: `EarthImagerySource.attribution` claims it is "surfaced in the Splash credits" — it is not; `Splash.tsx` hardcodes its credit list and never mentions EOX either. Adding GeoDanmark makes it two unfulfilled promises: flag to the user whether to wire real manifest-driven credits or fix the docstring; don't silently build either.

## Known risks

- **Seam character:** spring 2025 aerial vs 2016 summer satellite is a color/season jump at the band edge; the existing BMNG→EOX transition is the accepted precedent (hard resolution step, no crossfade — out of scope here).
- **Atlas pressure:** six more zoom levels near the ground worsens the already-open atlas working-set finding (64 slots vs ~107 wanted at deep zoom — see the atlas-thrash follow-up); check interaction before calling the band done.
- **Coverage nodata:** outside Denmark the WMS returns blank; the patch is deep inside coverage so a plain bbox harvest never sees it, but the fetcher should still reject non-image/blank-tile responses loudly.
