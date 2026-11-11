# VIIRS swath seam blending — research notes (2026-11-07)

## Findings (with citations)
1. Seam optimisation
- Kwatra, Schödl, Essa, Turk, Bobick, "Graphcut Textures", SIGGRAPH 2003 (ACM TOG 22(3)). Min-cut seam, cost |A-B| (optionally / gradient).
- Agarwala et al., "Interactive Digital Photomontage", SIGGRAPH 2004. Multi-label graph cut (alpha-expansion) + gradient-domain fusion.
- Uyttendaele, Eden, Szeliski, "Eliminating Ghosting and Exposure Artifacts in Image Mosaics", CVPR 2001.
- Eden, Uyttendaele, Szeliski, "Seamless Image Stitching of Scenes with Large Motions and Exposure Differences", CVPR 2006, pp. 2498-2505. Graph cut picks one source per moving object, then gradient-domain fixes exposure.
- Kerschner, "Seamline detection in colour orthoimage mosaicking by use of twin snakes", ISPRS JPRS 56, 2001.
- Chon, Kim, Lin, "Seam-line determination for image mosaicking: minimizing the maximum local mismatch and the global cost", ISPRS JPRS 2010 (Dijkstra + NCC, bottleneck cap).
- Li et al.(?), "Optimal Seamline Detection for Orthoimage Mosaicking by Combining Deep CNN and Graph Cuts", Remote Sensing 9(7):701, 2017, doi:10.3390/rs9070701 (CNN semantic cost + graph cut).
- "An Upscaling-Downscaling Optimal Seamline Detection Algorithm for Very Large RS Image Mosaicking", Remote Sensing 15(1):89, 2023, doi:10.3390/rs15010089 (coarse seam, refine in a band; <10% time of SLIC+graph cut).
- Yuan et al., "Hybrid Network-Based Automatic Seamline Detection for Orthophoto Mosaicking", IEEE TGRS 62:5621014, 2024.
- Gap: no paper found that routes seams around *atmospheric* clouds; object-avoidance literature (buildings via DSM/segmentation) is the analogue.

2. Gradient-domain / multiband
- Burt & Adelson, "A Multiresolution Spline with Application to Image Mosaics", ACM TOG 2(4), 1983.
- Pérez, Gangnet, Blake, "Poisson Image Editing", SIGGRAPH 2003.
- Levin, Zomet, Peleg, Weiss, "Seamless Image Stitching in the Gradient Domain" (GIST), ECCV 2004.
- Agarwala, "Efficient Gradient-Domain Compositing Using Quadtrees", SIGGRAPH 2007, doi:10.1145/1275808.1276495 (O(seam length) solve; Photoshop Auto-Blend).
- All of these fix intensity steps but are blind to geometry: misaligned content yields double edges (feather/multiband) or smeared edges (Poisson).

3. Motion compensation
- Zach, Pock, Bischof, "A Duality Based Approach for Realtime TV-L1 Optical Flow", DAGM 2007.
- Kroeger et al., "Fast Optical Flow using Dense Inverse Search" (DIS), ECCV 2016 (in OpenCV).
- Teed & Deng, "RAFT", ECCV 2020; Xu et al., "GMFlow", CVPR 2022; Huang et al., "FlowFormer", ECCV 2022.
- Vandal & Nemani, "Temporal Interpolation of Geostationary Satellite Imagery With Optical Flow", IEEE TNNLS 34:3245-3254, doi:10.1109/TNNLS.2021.3101742 (Super SloMo on GOES-16 ABI).
- Vandal et al., "WindFlow" / dense deep optical flow for AMVs (RAFT best vs NOAA AMVs). 
- WR-Net, arXiv 2303.04405 (2023): TV-L1 beats RGB-trained PWC-Net/FlowNet on GEO imagery.
- Joyce, Janowiak, Arkin, Xie, "CMORPH", J. Hydrometeor. 5:487-503, 2004: forward/backward advect LEO microwave swaths with GEO IR motion vectors, time-weighted morph between them. Operational precedent for exactly "warp LEO swaths to a common time using GEO motion".
- Apke et al., NOAA STAR seminar 2020: dense optical flow for 1-min GeoColor interpolation.

4. Deep stitching
- Nie et al., "Unsupervised Deep Image Stitching" (UDIS), IEEE TIP 2021, arXiv 2106.12859.
- Nie, Lin, Liao, Liu, Zhao, "Parallax-Tolerant Unsupervised Deep Image Stitching" (UDIS++), ICCV 2023, arXiv 2302.08207 (TPS warp + learned seam mask).
- Built for small-to-moderate parallax with a static scene in photos; mesh/TPS warps can't represent 100+ km non-rigid cloud motion; trained on natural RGB. Not applicable beyond idea of "warp then learned seam".

5. Operational
- GIBS/Worldview MODIS daily mosaic: per-pixel nearest-nadir selection, no blending (MODIS NRT Global Flood Product user guide; Worldview FAQ). VIIRS rule not documented that I found.
- BMNG (Stöckli et al. 2005): surface is temporal compositing; cloud layer method not documented publicly.
- Zoom Earth: live layer = GEO (GOES/Himawari/Meteosat) GeoColor, 10 min; no seam write-up. Windy/Mapbox/Google: no public write-up found.
