# Mars Sample Return HiRISE Mosaics

- DOI: https://doi.org/10.5066/P13CPYYU
- Version: v003, August 16, 2024
- Constituent HiRISE strips jointly bundle adjusted
- Aligned to CTX reference
- HiRISE strips mosaicked together
- Products in variants of equirectangular projections
  - Latitude of true scale = 0 degrees (aka "equi 0")

by Astrogeology, USGS
contact: Michael Bland, mbland@usgs.gov

## Summary

This archive contains final, edited HiRISE products as part of the Mars Sample Return mission. The archive contains both strip-level and mosaicked HiRISE products.

The stereopairs that make up the final HiRISE mosaic were first processed separately in BAE Systems' SOCET SET software. For each stereopair, the input images were bundle-adjusted relative to one another to improve the internal consistency of the camera positions. Initial DTMs were extracted from each stereopair based on the relative bundle solution. The initial DTMs from each stereopair were controlled to the Mars 2020 TRN CTX DTM Mosaic B (version 9) by first estimating a rigid transform (rotation + translation) using the `pc_align` tool from the NASA Ames Stereo Pipeline (ASP) to improve its absolute accuracy. Ground control of the initial DTM strips were further refined by reassigning heights in the rigidly-transformed ground points to match values from their respective reference DTMs in order to remove parabola-like or ramp-like vertical artifacts from several of the initial HiRISE DTM strips. The transformed position information was fed back into to the control network for each stereopair and the bundle adjustment recomputed.

The individually-controlled stereopairs were imported to a single SOCET SET project and bundle-adjusted together. DTMs were extracted using the updated bundle solution. The DTMs were then edited in SOCET SET to reduce (but not eliminate) the number and magnitude of blunders and undesirable textural artifacts. Orthoimages were then extracted from the individual stereopairs by projecting the input images onto the corresponding edited DTM. The jointly-bundle adjusted, edited DTMs, orthoimages, and Figure of Merit (FOM) rasters were exported from SOCET SET and reprojected into an equirectangular projection with latitude of true scale of 0 degrees before post-processing and mosaicking. Post-processing included radiometric balancing of the orthoimages and applying an additional 2D transform to the DTMs, orthoimages and FOMs. The strip-level orthoimages were radiometrically balanced to reduce strip-to-strip brightness differences in the orthomosaic products. There is also a known horizontal radial distortion between the preliminary HiRISE orthomosaic and the CTX orthomosaic reference. This artifact was corrected before delivery to JPL by applying an affine transformation to the edited products. The raw FOMs were simplified into FOM confidence maps and maps showing edited versus unedited pixels in the DTMs. Mosaic products were created separately from strip-level products in the same projection.

For each product type, the post-processed rasters were mosaicked together using the `dem_mosaic` tool from the Ames Stereo Pipeline. Orthoimages of the nadirmost member of each stereopair were mosaicked using a "first on top" strategy rather than averaging overlapping areas together or applying seam blending. Different version of DTM mosaics were created using a "first on top" strategy, and a strategy that blended the overlapping strips together along a 40 pixel-wide margin. A "delta geoid" DTM product was derived by running the `dem_geoid` tool from ASP on the blended DTM mosaic. The delta geoid products represent heights relative to the geoid of Mars (this product type is analogous to the MOLA Gridded Topography product available from the PDS). The delta radius DTMs represent heights relative to the IAU-recommended radius for Mars, 3396190 meters (the are similar to the MOLA Gridded Radius product available from the PDS, but the MOLA product uses a radius of 3396000 meters). The FOM products (confidence map and edited pixel mask) were mosaicked using a "first on top" strategy.

Any use of trade, firm, or product names is for descriptive purposes only and does not imply endorsement by the U.S. Government.

## Archive Structure

The directory structure of this archive is as follows:

```
.
│   ├── mosaics
│   │   ├── FOM_clrConfidence_legend.png
│   │   ├── MSR_hirise_soc_003_DTM_MOLATopography_DeltaGeoid_1m_Eqc_latTs0_lon0_Blend40.tif
│   │   ├── MSR_hirise_soc_003_FOM_ColorConfidence_1m_Eqc_latTs0_lon0.tif
│   │   ├── MSR_hirise_soc_003_FOM_Confidence_1m_Eqc_latTs0_lon0.tif
│   │   └── MSR_hirise_soc_003_Orthomosaic_0.25m_Eqc_latTs0_lon0_First_NoBlend.tif
│   │
│   ├── individual_images
│       ├── DTMs
│       │   ├── 1_DTM_MSR_HiRISE_Neretva_N_1m_MOLATopography_DeltaGeoid_eqc_c0.tif
│       │   ├── 2_DTM_MSR_HiRISE_CraterRim_1m_MOLATopography_DeltaGeoid_eqc_c0.tif
│       │   ├── 3_DTM_MSR_HiRISE_Ridge_S_1m_MOLATopography_DeltaGeoid_eqc_c0.tif
│       │   ├── 4_DTM_MSR_HiRISE_Smooth_S_1m_MOLATopography_DeltaGeoid_eqc_c0.tif
│       │   ├── 5_DTM_MSR_HiRISE_Dark_Basin_S_1m_MOLATopography_DeltaGeoid_eqc_c0.tif
│       │   ├── 7_DTM_MSR_HiRISE_DarkVallis_N_1m_MOLATopography_DeltaGeoid_eqc_c0.tif
│       │   ├── 8_DTM_MSR_HiRISE_Channel_N_1m_MOLATopography_DeltaGeoid_eqc_c0.tif
│       │   └── 9_DTM_MSR_HiRISE_Horizontal_N_1m_MOLATopography_DeltaGeoid_eqc_c0.tif
│       ├── Confidence
│       │   ├── 1_FOM_MSR_HiRISE_Neretva_N_1m_stage3_edited_eqc_c0_affine_confidence.tif
│       │   ├── 2_FOM_MSR_HiRISE_CraterRim_1m_stage3_edited_eqc_c0_affine_confidence.tif
│       │   ├── 3_FOM_MSR_HiRISE_Ridge_S_1m_stage3_edited_eqc_c0_affine_confidence.tif
│       │   ├── 4_FOM_MSR_HiRISE_Smooth_S_1m_stage3_edited_eqc_c0_affine_confidence.tif
│       │   ├── 5_FOM_MSR_HiRISE_Dark_Basin_S_1m_stage3_edited_eqc_c0_affine_confidence.tif
│       │   ├── 7_FOM_MSR_HiRISE_DarkVallis_N_1m_stage3_edited_eqc_c0_affine_confidence.tif
│       │   ├── 8_FOM_MSR_HiRISE_Channel_N_1m_stage3_edited_eqc_c0_affine_confidence.tif
│       │   ├── 9_FOM_MSR_HiRISE_Horizontal_N_1m_stage3_edited_eqc_c0_affine_confidence.tif
│       └── Orthoimages (nadir)
│           ├── 1_ESP_062530_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│           ├── 2_ESP_053734_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│           ├── 3_ESP_060130_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│           ├── 4_ESP_060196_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│           ├── 5_ESP_060341_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│           ├── 7_ESP_058996_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│           ├── 8_ESP_060763_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│           ├── 9_ESP_061607_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│           └── off_nadir
│               ├── 1_ESP_062319_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│               ├── 2_ESP_055145_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│               ├── 3_ESP_060275_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│               ├── 4_ESP_060486_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│               ├── 5_ESP_060407_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│               ├── 7_ESP_058930_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│               ├── 8_ESP_060697_1985_0.25m_stage3_edited_eqc_c0_affine.tif
│               └── 9_ESP_060829_1985_0.25m_stage3_edited_eqc_c0_affine.tif
└── README.md
```

For mosaics that were created using a "first-on-top" strategy, the first individual image (strip-level) product. Image order is listed in the mosaic's metadata.

The `individual_images` subdirectory are organized into subdirectories for `DTMs`, `FOMs`, and `Orthoimages`. The top of the `Orthoimages` directory contains the nadirmost member of each stereopair. The off-nadir members are included in the `off_nadir` subdirectory for reference, but only the nadirmost orthoimages were used to create orthomosaics.

## Mosaic Naming Convention

The mosaic products are named like `MSR_hirise_soc_<nnn>_<product class>[<_product subclass>]_<pixel size>_<projection abbreviation>_<mosaic parameters>`. `MSR_hirise_soc` indicates that these are mosaics in support of the MSR mission, derived from HiRISE data and created using SOCET SET. `<nnn>` is a zero-padded version number assigned by the USGS. This number will be incremented if updated versions of products are delivered to JPL. Although this is the first delivery of edited mosaics to JPL, these products represent version 003 created by USGS. `<product_class>` is one of "DTM," "FOM," or "Orthomosaic." DTMs are named `MOLATopography_DeltaGeoid` to indicate that they represent heights relative to the martian geoid (like the MOLA Gridded Topography product available from the PDS). FOMs have `_<product subclass>` named "Confidence." `<pixel size>` is a positive floating point number followed by a unit abbreviation to indicate the project pixel size of the mosaic. The mosaics in this delivery have pixel sizes of either 1 meter ("1m") or 0.25 meters ('0.25m"). `<projection abbreviation>` is an informal shorthand for the map projection that the raster uses. In this delivery, `<mosaic parameters>` is set to `Blend40` to indicate that strips were mosaicked using a linearly-weighted blend over a distance of 40 pixels across the seams.

## Image Format Information

The image data included in this delivery are formatted as GeoTIFFs which is suitable for reading with conventional desktop GIS software such as QGIS or ArcGIS.

## Artifacts

Next, the University of Arizona about page (https://www.uahirise.org/dtm/about.php) identifies four common known artifacts that are present in some, but not all, HiRISE DTMs. We reproduce their information below:

- Boxes: Some DTMs have square areas that are usually about .5-1 m different in elevation from the surrounding areas. These are artifacts of the processing algorithms used in SOCET Set ((c) BAE Systems). There may be groups of these boxes. These artifacts are usually left unedited, so the user should look for such artifacts in a terrain shaded relief map before using those parts of a DTM for analysis.
- CCD Seams: A HiRISE image is made up of 10 individual images, stitched together along their long edges. In a DTM, these seams can be visible as long lines. These seams are difficult to remove, and so are usually left unedited.
- Faceted Areas: Areas that were very bland (low contrast) or deeply shadowed with low contrast and low signal may have a “faceted” look to them. Terrain in these areas may only generally approximate the shape of terrain.
- Manually Interpolated Areas: Some manual editing tools result in a geometric pattern due to interpolation from boundary posts. The user should be aware of these and compare the DTM to the images to understand the quality of the interpolation.

---

## Skymap notes (Jezero site band, Perseverance)

The text above is the USGS archive's own README. Skymap bakes two files from it,
extracted loose from `MSR_TRN_HiRISE_soc_003_USGS_release_aug2024_mosaics.zip`
(5,468,062,403 B; plan ruling R3, 2026-09-17; the zip stays beside them):

| file                                                                              | size            |
| --------------------------------------------------------------------------------- | --------------- |
| `MSR_hirise_soc_003_DTM_MOLATopography_DeltaGeoid_1m_Eqc_latTs0_lon0_Blend40.tif` | 711,891,990 B   |
| `MSR_hirise_soc_003_Orthomosaic_0.25m_Eqc_latTs0_lon0_First_NoBlend.tif`          | 4,674,976,833 B |

- Upstream: DOI <https://doi.org/10.5066/P13CPYYU>, fetched by hand 2026-09-15.
  Public domain (US government work).
- Equirectangular, lat_ts 0, lon0 0, on a 3,396,190 m sphere; edge-registered.
  Both share the footprint 77.058–77.381 E, 18.136–18.588 N; LZW, 256² tiles
  (already tiled, so no COG conversion).
- DTM: 19144 × 26816, Float32 metres, 1 m pixels, `NoData = -32767`.
  **Vertical reference: the Mars areoid** ("DeltaGeoid", above). The +6,190 m
  rebase onto the scene datum is the bake's.
- Ortho: 76576 × 107264, Byte grey, 0.25 m pixels, `NoData = 0`. Colour comes
  from the Viking global band (colour-matched grey).

Worktrees reach both rasters through leaf symlinks to main's
`data/raw/hirise/jezero/`.
