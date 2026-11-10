# Frozen assets

Compiled into the binary (`src/geodecode.rs`), so a bake cannot run against other tables. Refitting is
an offline maintainer step; the bake's exit 4 (calibration drift) is what asks for it.

- `gibs-ir-colormap.xml`: the GIBS colour map for `GOES-East_ABI_Band13_Clean_Infrared`, used to invert
  GIBS IR frames back to brightness temperature. Upstream: the colour map GIBS serves for that
  layer (its colormap link in the WMTS GetCapabilities; title "Infrared Brightness Temperature"), fetched
  2026-11-06. The exact URL was not recorded then, and a guessed `colormaps/v1.3/<layer>.xml` path 404s.
- `geo-calib.json`, all fitted at 2026-11-06T12:00Z:
  - `mtg_lut`: EUMETView `mtg_fd:ir105_hrfi` grayscale stretch to degrees C.
  - `iodc_lut`: the IODC grey level quantile-matched to MTG temperatures over their full-overlap 8x8 blocks.
  - `qs` / `qr`: quantile map from the blended geo-IR opacity to the static map's opacity, over geo
    coverage minus ice sheets.
