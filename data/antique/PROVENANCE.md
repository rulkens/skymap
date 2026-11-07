# Antique-look ornament provenance

Source art for `npm run pack-ornaments` (`tools/antique/packOrnaments.ts`), which packs these into
`public/antique/ornaments.png`. Every sprite is an ink-density mask: RGB black, alpha = ink, paper = 0.

Crop boxes are `[x0, y0, x1, y1]` in pixels of the Commons file at the "scan size" given. Every source
work's author died more than 100 years ago and every scan is a faithful 2D reproduction, so PD-Art
applies.

| Sprite | Source work | Author / engraver | Year | Commons file page | Licence on Commons | Scan size used | Crop box |
| --- | --- | --- | --- | --- | --- | --- | --- |
| seaMonster | _Islandia_ (Theatrum Orbis Terrarum) | Abraham Ortelius (1527–1598) | c. 1590 (BnF dates it 1587) | [link](<https://commons.wikimedia.org/wiki/File:Islandia_-_(Ortelius_Abraham)_-_btv1b10678483d.jpg>) | Public domain (PD France / PD-US expired), BnF Gallica scan | 6424×4640 (orig.) | [1753, 3711, 2844, 4249] |
| hornedWhale | same | same | same | same | same | same | [3565, 3777, 4415, 4212] |
| seaHorse | same (Hroshvalur) | same | same | same | same | same | [1197, 3078, 2044, 3685] |
| spoutFish | same | same | same | same | same | same | [533, 486, 1059, 802] |
| cetus | _Firmamentum Sobiescianum sive Uranographia_, plate Cetus | Johannes Hevelius (1611–1687) | 1690 | [link](<https://commons.wikimedia.org/wiki/File:Cetus_(Uranographia_Hevelius).jpg>) | Public domain (author died >70 y; e-rara scan) | 4716×3537 (orig.) | [688, 98, 4278, 2827] |
| dragon | _Mundus Subterraneus_, winged dragon | Athanasius Kircher (1602–1680); Commons tags the attribution "Kircher?" | 1665 | [link](<https://commons.wikimedia.org/wiki/File:Kircher,_Athanasius_%E2%80%94_Mundus_Subterraneus_%E2%80%94_Winged_dragon_(on_the_ground)_%E2%80%94_1665.jpg>) | PD-Art (PD-old-100) | 1282×614 (orig.) | [8, 5, 1237, 614] |
| seaSerpent | _Serpentum et Draconum Historiae_, "Draconis alati figura ex Pareo" | Ulisse Aldrovandi (1522–1605), ed. Bartolomeo Ambrosini (d. 1657) | 1640 | [link](https://commons.wikimedia.org/wiki/File:Ulyssis_Aldrovandi_BHL41765473.jpg) | PD-scan (PD-old-70-expired), Biodiversity Heritage Library | 4624×2933 (orig.) | [325, 506, 4389, 2908] |
| ship | _Maris Pacifici_ (ship _Victoria_) | Abraham Ortelius; engr. Frans Hogenberg (d. 1590) | 1589 | [link](<https://commons.wikimedia.org/wiki/File:Maris_Pacifici,_(quod_vulg%3F%3F_Mar_del_Zur)_cum_regionibus_circumiacentibus,_insulisque_in_eodem_passim_sparsis_(IA_dr_maris-pacifici-quod-vulg-mar-del-zur-cum-regionibus-circumiacentibus-10001067).jpg>) | PD-old-100-expired, David Rumsey collection via Internet Archive | 14480×12062 (orig.) | [7913, 6043, 10235, 7810] |
| compassRose | _Ventorum Index_ (32-point rose), from Quad's _Geographisch Handtbuch_ | Matthias Quad (1557–1613) | c. 1600 | [link](<https://commons.wikimedia.org/wiki/File:82._Ventorum_Index_(Compass_Rose)._Vocabulorum_Geographicorum_(Legend_to_Geographical_Terms)._(IA_dr_82-ventorum-index-compass-rose-vocabulorum-geographicorum-legend-to-ge-9690172).jpg>) | PD-old-100-expired, David Rumsey via Internet Archive | 7669×5462 (orig.) | [1658, 980, 3678, 3160] |
| cartouche | _Aevi veteris typus geographicus_, imprint cartouche (text erased) | Abraham Ortelius; engr. Jan Wierix | 1590 | [link](<https://commons.wikimedia.org/wiki/File:Aevi_Veteris,_Typus_Geographicus._Abrah._Ortelius_Regiae_Mts._Geographus_describ._cum_Privilegijs_decennalib._Imp._Reg._et_(IA_dr_aevi-veteris-typus-geographicus-abrah-ortelius-regiae-mts-geographus-de-10001347).jpg>) | PD-old-100-expired, David Rumsey via Internet Archive | 14420×12062 (orig.) | [6168, 6430, 8449, 7892] |

The cartouche's title is engraved at pack time in IM FELL English (`fonts/`, © Igino Marini, SIL Open
Font License 1.1, `fonts/OFL-IMFell.txt`).

## Processing

Per sprite: crop to luminance, flatten the paper against a blurred max-filter background estimate and
map `1 − paper` to ink, remove ruled plate lines (bridging the hatching that crossed them), strip the
stipple sea on _Maris Pacifici_, apply hand-drawn keep and erase polygons, drop stroke components below
a size floor, then trim and resize to at most 1024 px on the long side.

## Known residue

- cartouche: short pieces of the map's radial lines remain between the scrolls (the specks inside the
  oval are erased at pack time).
- ship: some stipple sits along the rigging, and the angel and the smoke are slightly thinned.
- cetus: faint curved ecliptic and parallel arcs remain near the legs and the tail. Star symbols are
  kept on purpose.
- dragon: the source is only 1282 px wide, so the line detail is softer than the rest.
