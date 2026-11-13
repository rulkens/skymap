# Asteroid real colours from Gaia DR3 and SDSS MOC

## Why

The asteroids Layer tints a dot by its dynamical class, or the main belt by its Kirkwood band
(`Colour by: semiMajorAxis`, a stand-in for the S-type inner belt and C-type outer belt). Both are
guesses from the orbit. Two surveys measured the colour of about 100k–150k numbered asteroids
directly, so the belt could show its real composition gradient, and the odd ones out (a V-type
Vestoid in the outer belt, a C-type among the S-types) would read as odd.

## Data sources (licence and terms to check at pickup)

- **Gaia DR3 reflectance spectra**: about 60k asteroids, 16 bands from 374 to 1034 nm
  (Gaia Collaboration, Galluccio et al. 2023), in the Gaia archive's solar-system tables. Check the
  ESA Gaia data licence and its attribution wording.
- **SDSS Moving Object Catalog (MOC 4)**: about 100k known asteroids with ugriz colours (Ivezić et
  al.), archived at the PDS Small Bodies Node. Taxonomic classes derived from it exist (Carvano et
  al. 2010; DeMeo & Carry 2013). Check the PDS citation terms, and the licence of any derived
  taxonomy table.
- The two overlap. Which wins for a row both measured is a design question: Gaia covers more of the
  spectrum, SDSS more asteroids.

## What it would show

A third `Colour by` mode, for example `measured`: every row with a measurement takes a tint from
its spectrum or colours, mapped to linear RGB near unit Rec.709 luminance like the class tints, so
colour never changes how bright a dot reads. Expected: the inner belt S-type red fading to the
outer belt's neutral C-types, V-types standing out, and the Hildas and Trojans reddish D/P-types.

## Fallback for rows without data

The other 750k+ rows keep the tint they have today: their class tint, or the main belt's Kirkwood
band. The design must decide whether measured and fallback rows should look different (a
desaturated fallback, say), so a reader doesn't take a guessed tint for a measured one.

## Cost to price

A per-row colour (or taxonomy byte) in the build-time catalog, or a side file loaded with it; one
more read in the dot vertex stage, next to the element rows it already reads for a and H.
