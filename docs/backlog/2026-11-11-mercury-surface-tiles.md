# Mercury surface tiles

Follow-up to the Moon tiles (one registry row + one bake, as Mars and the Moon). USGS MESSENGER
global products, sizes checked 2026-11-11 under `https://planetarymaps.usgs.gov/mosaic/`:

- `Mercury_MESSENGER_MDIS_Basemap_LOI_Mosaic_Global_166m.tif`: low-incidence grey, 166 m, 4,247,471,083 B (least baked shading; preferred)
- `Mercury_MESSENGER_MDIS_Basemap_BDR_Mosaic_Global_166m.tif`: standard grey, 166 m, 4,247,470,901 B
- `Mercury_MESSENGER_MDIS_Basemap_EnhancedColor_Mosaic_Global_665m.tif`: enhanced colour, 665 m, 796,539,539 B
- `Mercury_Messenger_USGS_DEM_Global_665m_v2.tif`: stereo DEM, 665 m, 530,934,581 B

Measure each mosaic's photo-Sun geometry before reusing a recipe: the Moon's WAC turned out lit from
both sides (see `PhotoSun`). Height is the weak part, 665 m globally.
