# Antique paper — the antique look's sheet

Builds `public/antique/paper.webp` (a seamless 2048² laid-paper tile: albedo in rgb, relief in
alpha) and `public/antique/stains.webp` (a full-sheet ageing mask: R toning, G foxing, B tide
lines), which `shaders/antiqueLook/passes/paperBakeFragment.wesl` bakes into the plate's sheet.

## Sources (CC0 only)

The blank margins of two 1687 Rijksmuseum prints on laid paper, ~8.45 px/mm (one tile ≈ 242 mm):

- *Kaart van het Hoogheemraadschap van Rijnland (derde deel)*, RP-P-AO-10-8C, CC0 —
  https://commons.wikimedia.org/wiki/File:Kaart_van_het_Hoogheemraadschap_van_Rijnland_(derde_deel)_T%27_Hoogheymraedschap_van_Rhynland_(titel_op_object),_RP-P-AO-10-8C.jpg
- *… (eerste deel)*, RP-P-AO-10-8A, CC0 —
  https://commons.wikimedia.org/wiki/File:Kaart_van_het_Hoogheemraadschap_van_Rijnland_(eerste_deel)_T%27_Hoogheymraedschap_van_Rhynland_(titel_op_object),_RP-P-AO-10-8A.jpg

Rejected: CC0 texture sets (modern wove paper, no laid lines), stock photos (not CC0), David
Rumsey (NC) and Gallica (paid commercial use). Wide margins on small atlas prints are often a
19th-century museum mount, not period paper — check before cropping.

## Steps (Python with numpy, scipy, Pillow; `python3 -I`)

1. `fetch_commons.py <dl> 0 a=File:… b=File:…` — the two scans.
2. `build_albedo.py` — flatten illumination in linear light (divide by a ~14 mm blur), then
   toroidal image quilting (Efros & Freeman 2001) into a 2048² tile.
3. `finish_paper.py work/quilt_albedo.png work 7` — pin the mean colour to the cleanest margin
   (sRGB 243, 226, 204), fade large inclusions the eye would catch repeating, replace the scan's
   patchy laid lines with a procedural mould (laid ~1.15 mm, chain ~24 mm) written into albedo
   and height alike, and derive the height from tooth + formation + mould.
4. `build_stains.py work/stains.png 2048 1152 11` — per-edge toning (strongest at head and
   fore-edge, as in a bound atlas), clustered foxing, two tide lines with crisp outer rims.
5. Pack for the web: albedo rgb + height (16-bit normalised to 8) as alpha into one PNG, then
   `cwebp -q 88 -alpha_q 90 -exact` → `paper.webp`; `cwebp -q 90` the stain layers → `stains.webp`.

Never rotate the tile by 90°: laid lines run horizontally on a printed sheet.
