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
| dragon | _Mundus Subterraneus_, winged dragon | Athanasius Kircher (1602–1680); Commons tags the attribution "Kircher?" | 1665 | [link](<https://commons.wikimedia.org/wiki/File:Kircher,_Athanasius_%E2%80%94_Mundus_Subterraneus_%E2%80%94_Winged_dragon_(on_the_ground)_%E2%80%94_1665.jpg>) | PD-Art (PD-old-100) | 1282×614 (orig.) | [8, 5, 1237, 614] |
| seaSerpent | _Serpentum et Draconum Historiae_, "Draconis alati figura ex Pareo" | Ulisse Aldrovandi (1522–1605), ed. Bartolomeo Ambrosini (d. 1657) | 1640 | [link](https://commons.wikimedia.org/wiki/File:Ulyssis_Aldrovandi_BHL41765473.jpg) | PD-scan (PD-old-70-expired), Biodiversity Heritage Library | 4624×2933 (orig.) | [325, 506, 4389, 2908] |

The cartouche's title is engraved at pack time in IM FELL English (`fonts/`, © Igino Marini, SIL Open
Font License 1.1, `fonts/OFL-IMFell.txt`).

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
- **ship:** Goos labels no ship type; it is a typical Dutch three-masted merchantman of the 1660s,
  seen from the stern. The colour layer carries the washes: brown hull, green sea.

## Known residue

- whale: the belly line is cut where the whale lies on the dark shore hatching, and a few sea-hatching
  strokes remain under the body (the packer closes the silhouette over the gap).
- ship: a faint grey sea wash remains around the waterline.
- cetus: there are faint patches where the stars were inpainted, and a dashed remnant of the colure
  line remains on the neck.
- dragon: the source is only 1282 px wide, so the line detail is softer than the rest.
