# Antique-look ornament provenance

Source art for `npm run pack-ornaments` (`tools/antique/packOrnaments.ts`), which packs these into
`public/antique/ornaments.png`. Every sprite is an ink-density mask: RGB black, alpha = ink, paper = 0.
`ship.colour.png` is the matching colour layer of the hand-coloured ship: RGB = wash hue, alpha =
colour saturation (packed as the atlas's wash channel).

Crop boxes are `[x0, y0, x1, y1]` in pixels of the Commons file at the "scan size" given. Every source
work's author died more than 100 years ago and every scan is a faithful 2D reproduction, so PD-Art
applies.

| Sprite | Source work | Author / engraver | Year | Commons file page | Licence on Commons | Scan size used | Crop box |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cartouche | _Poli Arctici, et circumiacentium terrarum descriptio novissima_: the empty strapwork cartouche in the Tartaria quadrant (interior blank as engraved) | Frederik de Wit (1629/30–1706), Amsterdam | c. 1680 (BnF dates it 1690) | [link](https://commons.wikimedia.org/wiki/File:Poli_Arctici,_et_circumiacentium_terrarum_descriptio_novissima_-_per_F._de_Wit_-_btv1b10116728c.jpg) | Public domain (PD France / PD-US expired), BnF Gallica scan | 7487×6277 (orig.) | [5180, 1775, 5771, 2409] |
| whale | same map: the naturalistic whale in the lower-right whaling vignette | same | same | same | same | same | [4792, 5315, 5916, 5631] |
| ship (+ `ship.colour`) | _Paskaerte van Nova Granada en t'Eylandt California_ (Zee-Atlas): the stern-quarter three-master in the Pacific | Pieter Goos (1616–1675), Amsterdam | 1666 | [link](<https://commons.wikimedia.org/wiki/File:Paskaerte_van_Nova_Granada,_en_t%27Eylandt_California._t%27Amersterdam_by_Pieter_Goos_op%27t_Waater_inde_Vergulde_Zeepiegel,_Ao_1666._(IA_dr_paskaerte-van-nova-granada-en-teylandt-california-tamersterdam-by-piete-12179047).jpg>) | PD-old-100-expired, David Rumsey via Internet Archive | 11856×9198 (orig.) | [3532, 5108, 3971, 5847] |
| cetus | _Firmamentum Sobiescianum sive Uranographia_, plate Cetus | Johannes Hevelius (1611–1687) | 1690 | [link](<https://commons.wikimedia.org/wiki/File:Cetus_(Uranographia_Hevelius).jpg>) | Public domain (author died >70 y; e-rara scan) | 4716×3537 (orig.) | [688, 98, 4278, 2827] |
| seaMonster | _Islandia_ (Theatrum Orbis Terrarum) | Abraham Ortelius (1527–1598) | c. 1590 (BnF dates it 1587) | [link](<https://commons.wikimedia.org/wiki/File:Islandia_-_(Ortelius_Abraham)_-_btv1b10678483d.jpg>) | Public domain (PD France / PD-US expired), BnF Gallica scan | 6424×4640 (orig.) | [1753, 3711, 2844, 4249] |
| seaHorse | same (Hroshvalur) | same | same | same | same | same | [1197, 3078, 2044, 3685] |
| dragon | _Firmamentum Sobiescianum sive Uranographia_ (bound with _Prodromus astronomiae_), Fig. B, Draco | Johannes Hevelius (1611–1687) | 1690 | [link](<https://commons.wikimedia.org/wiki/File:Draco_Hevelius_-_Prodromus_astronomiae_1690_(5590223).jpg>) | PD-old-100-expired, Polona (National Library of Poland) scan | 4400×3474 (orig.) | [1359, 438, 3582, 3346] |
| seaSerpent | same atlas, Fig. TT, Hydra (uncoloured copy) | same | 1690 | [link](<https://commons.wikimedia.org/wiki/File:Hydra_-_Prodromus_astronomiae_1690_(436340).jpg>) | PD-old-100-expired, Polona scan | 4435×3495 (orig.) | [44, 441, 4442, 1739] |

The cartouche's title is engraved at pack time in IM FELL English (`data/raw/fonts/`, © Igino Marini, SIL Open
Font License 1.1, `data/raw/fonts/OFL-IMFell.txt`).

## Processing

Per sprite: crop to luminance (the coloured ship uses the max channel, so its washes do not read as
ink), flatten the paper against a blurred max-filter background estimate and map `1 − paper` to ink,
remove ruled plate lines (bridging the hatching that crossed them), apply hand-drawn keep and erase
polygons, drop stroke components below a size floor, then trim and resize to at most 1024 px on the
long side.

- **cetus:** 45 of Hevelius' star symbols are removed, each replaced by the nearby patch of engraving
  whose surrounding ring matched best (a small exemplar inpaint), and the leftover chart arcs and a
  stray letter are erased. The figure keeps the source orientation, Hevelius' globe view; the
  renderer mirrors it.
- **dragon, seaSerpent:** the same pipeline as cetus, with 35 and 36 star symbols inpainted from
  nearby body hatching (inked donors only, so no blank paper discs). The chart lines are removed per
  half of the plate, because the two sheets of each plate are offset at the gutter. Neither figure
  is mirrored.
- **ship:** Goos labels no ship type; it is a typical Dutch three-masted merchantman of the 1660s,
  seen from the stern. The colour layer carries the washes: brown hull, green sea.

## Known residue

- whale: the belly line is cut where the whale lies on the dark shore hatching, and a few sea-hatching
  strokes remain under the body (the packer closes the silhouette over the gap).
- ship: a faint grey sea wash remains around the waterline.
- cetus: there are faint patches where the stars were inpainted, and a dashed remnant of the colure
  line remains on the neck.
- dragon, seaSerpent: both keep the plate's gutter seam (a vertical break in the hatching through
  Draco's head and coils), a few Bayer letters and soft inpaint patches.
- dragon: the tail near α has a short ragged stretch where a degree-scale circle crossed it.
- seaSerpent: two short gaps in the body, where Hevelius drew Crater's foot and Corvus's claws over
  the serpent and both were removed.
