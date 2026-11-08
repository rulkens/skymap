# Antique sprites — re-cutting a cartouche from its scan

Rebuilds `data/antique/sprites/strapwork.png` and `tablet.png` (ink-density masks: RGB black,
alpha = ink, paper = 0) from the public-domain scans listed in
[`data/antique/PROVENANCE.md`](../../../data/antique/PROVENANCE.md), which also records how each
was cleaned. Both commands reproduce the committed sprites byte for byte. The other sprites were
cut by hand before these scripts existed.

## Steps (Python with numpy, scipy, Pillow; `python3 -I`)

1. Download the full-size Commons file of each source (the scan size in PROVENANCE.md; the crop
   boxes in the specs are in its pixels).
2. `extract_engraving.py <scan.jpg> <out.png> <spec.json> [preview.png]` — reads ink from the
   scan's max channel, so a colourist's wash reads as paper and only the engraved line as ink;
   cuts the map's ruled lines away with a body mask; trims and resizes. Specs: `tablet.json`
   (Goos, *Pascaart van de Noort Zee*) and `strapwork.json` (Ortelius, *Aevi Veteris*).
3. Strapwork only: `erase_rule_boxes.py <extracted.png> data/antique/sprites/strapwork.png <diff.png>`
   — erases the graticule ends left in the straps' gaps (hand-placed boxes, strokes under 5 px).
4. `npm run pack-ornaments` packs the sprites into `public/antique/ornaments.png`.
