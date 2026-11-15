# Prism spectrum overlay

**Status:** needs-design. Mocked 2026-11-15 over the live sky (desktop only, a 2D canvas over
the WebGPU scene, not a renderer pass); the mock code was gitignored scratch and is gone, this file
keeps what it showed.

## The idea

An overlay that runs each bright star's light through a virtual prism and draws its spectrum as a
horizontal streak at the star: a colour version of an objective-prism plate, which looks like a
cinematic anamorphic streak. The didactic hook is that this is how Harvard's plates looked, every
star a short spectrum, and how Annie Jump Cannon built the O–M sequence from about 350,000 of them.
Prior art: CfA's objective-prism plates (e.g. plate i38727, 1914), DASCH scans, Pickering (1912).

## The data (verified 2026-11-15)

- **Gaia DR3 XP (BP/RP) mean spectra**: ~220 M sources, 336–1020 nm at 2 nm in absolute
  W m⁻² nm⁻¹, low resolution (R ≈ 30–100). They carry continuum shape, the Balmer jump, broad
  Hβ/Hα dips, TiO notches, Wolf-Rayet emission, but no thin lines. Fetch: DataLink
  `gea.esac.esa.int/data-server/data?RETRIEVAL_TYPE=XP_SAMPLED&ID=<ids>&FORMAT=csv&DATA_STRUCTURE=DATAMODEL_GAIA&RELEASE=Gaia+DR3`,
  at most 50 source ids per call (`COMBINED`/`RAW` are rejected). An XP flux at 555 nm agreed
  with the star's V within 16% on the one star checked.
- **No XP for the brightest stars**: Gaia saturates. In Orion's 100 brightest by V (to V 5.86,
  IAU boundary), 46 have none, including all ten named stars (Rigel, Betelgeuse, the Belt,
  Bellatrix, Saiph, Meissa, Hatysa, Tabit). The stars a viewer looks at first are the ones Gaia
  can't measure.
- **Templates for the gap**: Pickles (1998) UVKLIB, 131 types, from
  `ssb.stsci.edu/cdbs/grid/pickles/dat_uvk/` (wavelengths in ångströms; archive.stsci.edu was
  unreachable from the cloud container). Matched by Hipparcos `sptype` (`public.hipparcos` on the
  Gaia TAP), scaled to the star's V. Hipparcos types need fixes (Meissa is just `O...`; it's O8 III).
- **RVS spectra** (~1 M, 846–870 nm) are near-infrared only: no use for a visible rainbow.
- Gaia DR4 is expected around December 2026; check what it adds before baking.

## What the mock showed

- **The streaks read as cinematic** once the tonemap works on the brightest channel with
  white bleed only in deep over-exposure: Rigel, the Belt and Betelgeuse burn white-hot with
  coloured halos, faint stars fade back. Physically linear star-to-star brightness (γ = 1) read
  best; a compressed range made every star look the same.
- **In the sky, spectra look alike**: at real exposure every streak is a rainbow, and types
  differ mainly in where the streak fades. The character shows on a side-by-side **plate**
  (the same stars, each normalised to its peak, O→M then peculiar): blue fading down the sequence,
  the carbon star's missing blue, Wolf-Rayet emission lumps, the Hβ dip. A plate card may be the
  teaching half of the feature, not an extra.
- **Mixed provenance shows**: templates have sharper lines than XP, so in Orion the bright stars
  (templates) and faint ones (measured) look different for a reason that isn't astrophysics.

## Decisions taken in the mock (keep unless the design says otherwise)

- Prism position linear in 1/λ² (Cauchy): violet spreads wide, red is packed and burns
  brightest, as in real glass. Per-pixel energy includes dλ/dx.
- Wavelength → colour via the CIE 1931 2° observer (Wyman–Sloan–Shirley 2013 fit) to linear sRGB;
  out-of-gamut cyan needs some added white, or it clips to a dark band. A luminance-preserving gamut
  fix blew up near 462 nm, and a luminance tonemap let pure blue blow out (weight 0.07): both left
  hard vertical edges.
- One dispersion direction for every star (horizontal), pivot at 550 nm on the star.

## Open design questions

- **Provenance labelling**: "measured by Gaia" vs "typical for a B8 Ia star", on the streak,
  the InfoCard, or both; and whether templates blur to XP resolution so the two look alike.
- **Which stars**: the brightest N on screen (Orion's 100 ran to V 5.86), a curated set, or the
  famous-star seed (which already has `spectralType`).
- **Where it lives**: a pass in `starCatalog` or its own Layer; star records carry only a
  quantized BP−RP, no Gaia source id, so a separate small catalog (position + ~90 bins × 1 byte,
  ~2 MB for 20 k stars) avoids touching the octree.
- **Exposure**: an artistic gain is unavoidable; say so in the UI copy.
- **Crowding**: the Belt and sword overlap heavily, as real objective-prism plates do.
- Phone layout and the dome were not tried.
