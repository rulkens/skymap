# Attributions

Skymap's source code is MIT-licensed (see [LICENSE](LICENSE)); the TypeScript,
WGSL and React source under `src/`, `tools/` and `tests/` is © Alexander
Rulkens. This file lists the data, imagery, models, fonts and code of others
that skymap ships, fetches or was built from, with the terms each rights holder
states. If something is missing or wrong, please open an issue.

## How to read and extend this file

Every third-party thing is one `###` entry with the same bullets:

- **What** it is, **By** whom, the **Licence** or terms, the **Attribution**
  asked for, the **Upstream** link, where it **Enters skymap**, and whether
  skymap **Modified** it.
- **Checked** gives the date on which the pages listed after it were opened and
  the licence and attribution lines compared with them. Where a rights holder
  states no licence the entry says so; none is inferred. An optional
  **Not verified** bullet names what could not be opened that day.
- The comment under each heading (`<!-- attribution: id=…; keys=…; hosts=… -->`)
  ties the entry to keys of
  [`rawDataRegistry.ts`](tools/utils/io/rawDataRegistry.ts) (`*` ends a prefix)
  and to outside hosts named in the app's code.

[`parseAttributions.ts`](tools/utils/io/parseAttributions.ts) reads the entries
back as rows, and
[`attributionCoverage.test.ts`](tests/tools/utils/io/attributionCoverage.test.ts)
fails when a registry key or a host in `src/`, `index.html` or
`.env.production` has no entry here. Adding a source therefore means adding its
entry, with the page you read and the date.

The entries state terms; they are not legal advice.

## Catalogue data

Several catalogues below reach skymap through CDS (VizieR or its FTP mirror).
CDS states its own terms for what it serves, quoted once here and referred to
as "the CDS terms" in the entries: "The data retrieved with VizieR are free of
usage in a scientific context; however, as it is the usage in scientific
publication, the original authors and publication references including the
publisher have to be explicitely cited", "The commercial usage of the data is
subject to rules depending of the origin", "Tabular data, spectra or images
coming from AAS journals (J/ApJ, J/ApJS, J/AJ) are under CC-BY-NC licence",
"Tabular data, spectra or images coming from A&A (J/A+A) are free for a
scientific usage", and for other catalogues "Please refer to the ReadMe file
associated to the catalogue to verify if a 'copyright' exists. Else, see the
policy section of the journals."
(<https://cds.unistra.fr/vizier-org/licences_vizier.html>, read 2026-10-07; the
link CDS attaches to "CC-BY-NC" on that page points at the by-nc-nd licence.)

### SDSS, the Sloan Digital Sky Survey (DR17 spectra and photometry)

<!-- attribution: id=sdss; keys=sdss.*; hosts=www.sdss.org,www.sdss4.org -->

- **What:** Sky positions, spectroscopic redshifts, `ugriz` magnitudes and
  shapes of galaxies: our own query of `SpecObj` joined to `PhotoObjAll`.
- **By:** The SDSS collaboration (SDSS-IV for DR17).
- **Licence:** "All SDSS data released in our public data releases is
  considered in the public domain."
- **Attribution:** SDSS asks that papers using its data carry the
  acknowledgement of the survey phase and cite the release paper (DR17:
  Abdurro'uf et al. 2022). The SDSS-IV acknowledgement opens:
  "Funding for the Sloan Digital Sky Survey IV has been provided by the Alfred
  P. Sloan Foundation, the U.S. Department of Energy Office of Science, and
  the Participating Institutions. SDSS-IV acknowledges support and resources
  from the Center for High Performance Computing at the University of Utah.
  The SDSS website is www.sdss4.org." The full text, with the list of
  institutions, is on the page under Checked.
- **Upstream:** <https://www.sdss4.org/dr17/>, queried through SkyServer /
  CasJobs.
- **Enters skymap:** `data/raw/sdss/Skyserver_*.csv` → `tools/parsers/sdssCsv.ts`
  → `public/data/galaxy-catalog/`.
- **Modified:** Yes. Filtered by our SQL, cross-matched, cut to the most
  luminous rows per data size and re-encoded.
- **Checked:** 2026-10-07: <https://www.sdss4.org/collaboration/#image-use>,
  <https://www.sdss4.org/collaboration/citing-sdss/>,
  <https://www.sdss.org/collaboration/citing-sdss/>

### 2MRS, the 2MASS Redshift Survey

<!-- attribution: id=2mrs; keys=2mrs.table3,2mrs.readme; hosts=lambda.gsfc.nasa.gov -->

- **What:** Positions, velocities and J/H/K magnitudes of 44,599 nearby
  galaxies (table 3).
- **By:** Huchra et al. 2012, ApJS 199, 26.
- **Licence:** Not stated on the survey's own page, and the VizieR ReadMe
  (J/ApJS/199/26) carries no copyright section. The CDS terms above apply to
  the copy served by CDS, which they class as AAS-journal data.
- **Attribution:** Cite Huchra et al. 2012. 2MASS, on which the survey rests,
  asks for: "This publication makes use of data products from the Two Micron
  All Sky Survey, which is a joint project of the University of Massachusetts
  and the Infrared Processing and Analysis Center/California Institute of
  Technology, funded by the National Aeronautics and Space Administration and
  the National Science Foundation."
- **Upstream:** <http://tdc-www.harvard.edu/2mrs/>;
  <https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/ApJS/199/26>
- **Enters skymap:** `data/raw/2mrs/2mrs_table3.dat` → `tools/parsers/twoMrs.ts`.
- **Modified:** Yes. Cross-matched, given distances and re-encoded.
- **Checked:** 2026-10-07: <http://tdc-www.harvard.edu/2mrs/>,
  <https://www.ipac.caltech.edu/2mass/releases/allsky/faq.html>,
  <https://cds.unistra.fr/vizier-org/licences_vizier.html>

### 2MASS Extended Source Catalog (XSC)

<!-- attribution: id=2mass-xsc; keys=2mrs.xsc-pa -->

- **What:** Position angle and axis ratio (`sup_phi`, `sup_ba`) of 2MRS
  galaxies, from VizieR `VII/233/xsc`.
- **By:** Jarrett et al. 2000, AJ 119, 2498; the 2MASS project (University of
  Massachusetts and IPAC/Caltech).
- **Licence:** Not stated for the catalogue on the 2MASS page read. The CDS
  terms above apply to the copy served by CDS.
- **Attribution:** The 2MASS acknowledgement quoted under 2MRS, and the VizieR
  acknowledgement (see VizieR below).
- **Upstream:** <https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/233>
- **Enters skymap:** `tools/fetch/fetch2massXsc.ts` → `data/raw/2mrs/2mass_xsc_pa.csv`.
- **Modified:** Yes. Two columns kept, joined to 2MRS by 2MASS id.
- **Checked:** 2026-10-07: <https://www.ipac.caltech.edu/2mass/releases/allsky/faq.html>,
  <https://cds.unistra.fr/vizier-org/licences_vizier.html>

### GLADE v2.3, the Galaxy List for the Advanced Detector Era

<!-- attribution: id=glade; keys=glade.*; hosts=glade.elte.hu -->

- **What:** An all-sky compilation of galaxies with spectroscopic and
  photometric redshifts, B-band photometry and PGC numbers.
- **By:** Dálya et al. 2018, MNRAS 479, 2374.
- **Licence:** Not stated. The catalogue's page carries "© Copyright Gergely
  Dálya" and no licence; the VizieR ReadMe (VII/281) has no copyright section.
  The CDS terms above apply to the copy served by CDS.
- **Attribution:** Cite the paper. (The page asks this in words for GLADE+,
  "Please cite this paper when using GLADE+ data", and names the 2018 paper as
  the description of v2.3.)
- **Upstream:** <https://glade.elte.hu/>;
  <https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/281>
- **Enters skymap:** `data/raw/glade/glade2.3.dat` → `tools/parsers/glade.ts`.
- **Modified:** Yes. Deduplicated against SDSS and 2MRS, subsampled, re-encoded.
- **Checked:** 2026-10-07: <https://glade.elte.hu/>,
  <https://cds.unistra.fr/vizier-org/licences_vizier.html>

### HyperLEDA

<!-- attribution: id=hyperleda; keys=hyperleda.* -->

- **What:** Position angle, axis ratio and diameter of GLADE galaxies; the
  `mod0` distance modulus used inside 30 Mpc; names and designations for the
  famous-galaxy list and the search aliases.
- **By:** Makarov et al. 2014, A&A 570, A13; Paturel et al. 2003, A&A 412, 45.
- **Licence:** Not stated on the database's page.
- **Attribution:** "If HyperLeda was helpful to your research an
  acknowledgment would be appreciated"; cite Makarov et al. 2014.
- **Upstream:** <http://atlas.obs-hp.fr/hyperleda/>
- **Enters skymap:** `tools/fetch/fetchHyperLeda.ts`, `tools/fetch/buildPgcAliases.ts`
  → `data/raw/hyperleda/`; a gzipped copy of the orientation cache is hosted
  on R2 for contributors.
- **Modified:** Yes. Selected columns, cached per PGC.
- **Checked:** 2026-10-07: <http://atlas.obs-hp.fr/hyperleda/>

### Milliquas v8, the Million Quasars catalogue

<!-- attribution: id=milliquas; keys=milliquas.*; hosts=heasarc.gsfc.nasa.gov -->

- **What:** Positions and redshifts of 1,021,800 quasars and active galactic
  nuclei.
- **By:** Eric W. Flesch. Flesch 2023, OJAp 6, 49
  ([arXiv:2308.01505](https://arxiv.org/abs/2308.01505)).
- **Licence:** Not stated, on the catalogue's page or in its ReadMe.
- **Attribution:** "Please cite as Milliquas v8, Flesch, E.W. 2023,OJAp,6,49.
  (arXiv:2308.01505)" (the ReadMe). HEASARC's copy adds: "If you use this
  catalog in published research, the author requests that you please cite it."
- **Upstream:** <https://quasars.org/milliquas.htm>
- **Enters skymap:** `npm run fetch-milliquas` → `data/raw/milliquas/milliquas.txt`
  → `tools/parsers/milliquas.ts` → `public/data/galaxy-catalog/milliquas-*.bin`.
- **Modified:** Yes. Rows with a usable redshift kept, placed by redshift,
  subsampled, re-encoded.
- **Checked:** 2026-10-07: <https://quasars.org/milliquas.htm>,
  <https://quasars.org/Milliquas-ReadMe.txt>,
  <https://heasarc.gsfc.nasa.gov/W3Browse/all/milliquas.html>

### DESI DR1, the Dark Energy Spectroscopic Instrument

<!-- attribution: id=desi; keys=desi.*; hosts=data.desi.lbl.gov -->

- **What:** DR1 large-scale-structure clustering catalogues v1.5 (the four
  northern tracer files `BGS_BRIGHT`, `LRG`, `ELG_LOPnotqso`, `QSO`), cut to
  three regions.
- **By:** The DESI Collaboration. DESI Collaboration et al. 2026, "Data Release
  1 of the Dark Energy Spectroscopic Instrument", AJ 171, 285.
- **Licence:** CC BY 4.0. DESI's conditions: cite the data release paper,
  "Indicate if any changes are made (if re-distributing DESI data)", and
  "Include the following acknowledgments text in any publications or derived
  works."
- **Attribution:** The acknowledgement, verbatim:

  > This research used data obtained with the Dark Energy Spectroscopic Instrument (DESI). DESI construction and operations is managed by the Lawrence Berkeley National Laboratory. This material is based upon work supported by the U.S. Department of Energy, Office of Science, Office of High-Energy Physics, under Contract No. DE–AC02–05CH11231, and by the National Energy Research Scientific Computing Center, a DOE Office of Science User Facility under the same contract. Additional support for DESI was provided by the U.S. National Science Foundation (NSF), Division of Astronomical Sciences under Contract No. AST-0950945 to the NSF’s National Optical-Infrared Astronomy Research Laboratory; the Science and Technology Facilities Council of the United Kingdom; the Gordon and Betty Moore Foundation; the Heising-Simons Foundation; the French Alternative Energies and Atomic Energy Commission (CEA); the National Council of Humanities, Science and Technology of Mexico (CONAHCYT); the Ministry of Science and Innovation of Spain (MICINN), and by the DESI Member Institutions: www.desi.lbl.gov/collaborating-institutions. The DESI collaboration is honored to be permitted to conduct scientific research on I’oligam Du’ag (Kitt Peak), a mountain with particular significance to the Tohono O’odham Nation. Any opinions, findings, and conclusions or recommendations expressed in this material are those of the author(s) and do not necessarily reflect the views of the U.S. National Science Foundation, the U.S. Department of Energy, or any of the listed funding agencies.

- **Upstream:** <https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/>
- **Enters skymap:** `npm run fetch-desi` → `data/raw/desi/*.fits` →
  `tools/parsers/desiFits.ts` → `desi-{deep,wedge,sgw}.bin`.
- **Modified:** Yes. Cut to three regions (`tools/catalog/desiPatches.ts`),
  deduplicated against the other surveys, re-encoded.
- **Checked:** 2026-10-07: <https://data.desi.lbl.gov/doc/acknowledgments/>

### Cosmicflows-4 distances

<!-- attribution: id=cf4-distances; keys=cf4.table2,cf4.readme,cf4.sha256 -->

- **What:** Distances measured without redshift for 55,877 galaxies (table 2),
  used for galaxies inside 30 Mpc.
- **By:** Tully et al. 2023, ApJ 944, 94
  ([arXiv:2209.11238](https://arxiv.org/abs/2209.11238)).
- **Licence:** The VizieR ReadMe (J/ApJ/944/94) carries no copyright section.
  The CDS terms above apply; they class the table as AAS-journal data.
- **Attribution:** Cite Tully et al. 2023.
- **Upstream:** <https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/>
- **Enters skymap:** `npm run fetch-cf4` → `data/raw/cf4/table2.dat` →
  `tools/parsers/cosmicflows4.ts` → `tools/catalog/catalogDistanceFor.ts`.
- **Modified:** Yes. One distance per PGC number is read; it moves a galaxy's
  position.
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>

### Gaia DR3

<!-- attribution: id=gaia; keys=gaia.dir,gaia.readme,gaia.sha256; hosts=www.cosmos.esa.int -->

- **What:** Positions, `G` magnitude and `BP−RP` colour of the stars brighter
  than G = 14, from `gaiadr3.gaia_source_lite`.
- **By:** ESA and the Gaia Data Processing and Analysis Consortium (DPAC).
  Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1.
- **Licence:** "Gaia data are distributed under the CC BY-NC 3.0 IGO license.
  For details and guidelines concerning commercial use of the Gaia data, please
  see the Terms and Conditions for the use of data in the ESA space science
  archives."
- **Attribution:** The acknowledgement, verbatim:

  > This work has made use of data from the European Space Agency (ESA) mission Gaia (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium). Funding for the DPAC has been provided by national institutions, in particular the institutions participating in the Gaia Multilateral Agreement.

- **Upstream:** <https://gea.esac.esa.int/tap-server/tap/sync> (the Gaia
  archive's TAP service).
- **Enters skymap:** `npm run fetch-gaia` → `data/raw/gaia/gaia_page_*.csv` →
  `npm run build-stars` → `public/data/star-catalog/`.
- **Modified:** Yes. Selected, given distances, deduplicated, quantised into an
  octree.
- **Checked:** 2026-10-07: <https://www.cosmos.esa.int/web/gaia-users/license>,
  <https://gea.esac.esa.int/archive/documentation/GDR3/Miscellaneous/sec_credit_and_citation_instructions/>

### Bailer-Jones distances (Gaia EDR3)

<!-- attribution: id=bailer-jones -->

- **What:** Geometric and photogeometric distance estimates per star
  (`external.gaiaedr3_distance`), joined to the Gaia rows by `source_id`.
- **By:** Bailer-Jones et al. 2021, AJ 161, 147.
- **Licence:** No separate licence found; the table is served by the Gaia
  archive, whose data licence is quoted under Gaia DR3.
- **Attribution:** Cite Bailer-Jones et al. 2021, with the Gaia acknowledgement.
- **Upstream:** <https://gea.esac.esa.int/tap-server/tap/sync>
- **Enters skymap:** the same `fetch-gaia` query; `tools/stars/resolveStarDistancePc.ts`.
- **Modified:** Yes. One distance per star is chosen and sets its position.
- **Checked:** 2026-10-07: <https://www.cosmos.esa.int/web/gaia-users/license>

### GCNS, the Gaia Catalogue of Nearby Stars

<!-- attribution: id=gcns; keys=gaia.gcns -->

- **What:** The 331,312 stars within 100 pc (`external.gaiaedr3_gcns_main_1`).
- **By:** Gaia Collaboration, Smart et al. 2021, A&A 649, A6.
- **Licence:** No separate licence found; served by the Gaia archive, whose
  data licence is quoted under Gaia DR3.
- **Attribution:** Cite Smart et al. 2021, with the Gaia acknowledgement.
- **Upstream:** <https://gea.esac.esa.int/tap-server/tap/sync>
- **Enters skymap:** `npm run fetch-gaia` → `data/raw/gaia/gcns_main.csv`.
- **Modified:** Yes. Merged into the star set.
- **Checked:** 2026-10-07: <https://www.cosmos.esa.int/web/gaia-users/license>

### Hipparcos, the 2007 re-reduction

<!-- attribution: id=hipparcos; keys=gaia.hipparcos,gaia.hipparcos-readme,gaia.hip-xmatch; hosts=cdsarc.cds.unistra.fr -->

- **What:** The bright stars that saturate Gaia (`hip2.dat`, VizieR I/311), and
  the Gaia archive's Hipparcos cross-match table.
- **By:** van Leeuwen 2007, A&A 474, 653.
- **Licence:** The ReadMe (I/311) carries no copyright section. The CDS terms
  above apply.
- **Attribution:** Cite van Leeuwen 2007.
- **Upstream:** <https://cdsarc.cds.unistra.fr/ftp/I/311/>
- **Enters skymap:** `npm run fetch-gaia` → `data/raw/gaia/hip2.dat` →
  `tools/parsers/hipparcos2.ts`.
- **Modified:** Yes. Merged into the star set in place of the matching Gaia rows.
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>

### Stars orbiting Sagittarius A\* (Gillessen et al. 2017)

<!-- attribution: id=s-stars -->

- **What:** Orbital elements of 39 bound S-stars (`J/ApJ/837/30/table3`), and
  astrometry of S2, S12 and S38 (`table5`) held as a test fixture only.
- **By:** Gillessen et al. 2017, ApJ 837, 30. The fixture's origin follows
  Plewa et al. 2015, MNRAS 453, 3234.
- **Licence:** The CDS terms above apply; they class the tables as AAS-journal
  data.
- **Attribution:** Cite Gillessen et al. 2017.
- **Upstream:** <https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/ApJ/837/30>
- **Enters skymap:** typed by hand into `src/data/bodies/sStarElements.ts`
  (one source line per row) and `tests/fixtures/sStarAstrometry.json`.
- **Modified:** No values changed. The 40th published row, S111, is left out as
  unbound.
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>

### S301 (GRAVITY Collaboration 2026)

<!-- attribution: id=s301 -->

- **What:** One more orbit around Sagittarius A\*, Solution A of the paper's
  Extended Data Table 2.
- **By:** Abd El Dayem et al. (GRAVITY Collaboration) 2026, "Discovery of a
  star sensitive to the spin of Sgr A\*", Nature,
  doi:10.1038/s41586-026-10894-w.
- **Licence:** A published paper; seven numbers are transcribed. The journal's
  terms were not read.
- **Attribution:** Cite the paper.
- **Upstream:** <https://arxiv.org/abs/2607.12664>
- **Enters skymap:** one row of `src/data/bodies/sStarElements.ts`.
- **Modified:** No.
- **Checked:** 2026-10-07: no page opened; the reference is as recorded in the
  repository.
- **Not verified:** the paper itself.

### The distance and mass of Sagittarius A\* (GRAVITY Collaboration 2019)

<!-- attribution: id=gravity-r0 -->

- **What:** R₀ = 8178 pc and M = 4.297 × 10⁶ M☉.
- **By:** GRAVITY Collaboration (Abuter et al.) 2019, A&A 625, L10.
- **Licence:** A published paper; two numbers are used.
- **Attribution:** Cite the paper.
- **Upstream:** A&A 625, L10 (the journal; no link is recorded in the repository).
- **Enters skymap:** `src/data/milkyWay/galacticCenter.ts` and the S-star scale.
- **Modified:** No.
- **Checked:** 2026-10-07: no page opened.
- **Not verified:** the paper itself.

### Main-sequence temperatures and radii (Pecaut & Mamajek 2013)

<!-- attribution: id=pecaut-mamajek -->

- **What:** The scale against which the S-stars' representative temperatures
  and radii were spot-checked.
- **By:** Pecaut & Mamajek 2013, ApJS 208, 9.
- **Licence:** A published paper; used as a reference scale.
- **Attribution:** Cite the paper.
- **Upstream:** ApJS 208, 9 (the journal; no link is recorded in the repository).
- **Enters skymap:** `src/data/bodies/sStarAppearance.ts`.
- **Modified:** The values in the file are our own representative table, not
  the paper's.
- **Checked:** 2026-10-07: no page opened.
- **Not verified:** the paper itself.

### JPL Solar System Dynamics: orbital elements

<!-- attribution: id=jpl-elements; hosts=ssd.jpl.nasa.gov -->

- **What:** Keplerian elements of the eight planets ("Keplerian Elements for
  Approximate Positions of the Major Planets") and mean elements of the Moon
  and the planetary satellites.
- **By:** The JPL Solar System Dynamics group. The planets page says of
  itself: "This content is from an article written by E.M. Standish and J.G.
  Williams in 1992. It has been published here with permission from the
  author".
- **Licence:** Not stated for the tables. JPL's image-use policy (for images
  and video on JPL sites) allows use "for any purpose without prior
  permission", with the credit line "Courtesy NASA/JPL-Caltech".
- **Attribution:** "For referencing the data downloaded from the SSD website,
  please use the following citation: “Solar System Dynamics. (Downloaded Year,
  Month, Date). (Title of the Page). https://ssd.jpl.nasa.gov”".
- **Upstream:** <https://ssd.jpl.nasa.gov/planets/approx_pos.html>,
  <https://ssd.jpl.nasa.gov/sats/elem/>
- **Enters skymap:** typed by hand into `src/data/bodies/orbitalElements.ts`.
- **Modified:** No values changed; corrections fitted to Horizons are added on
  top (next entry).
- **Checked:** 2026-10-07: <https://ssd.jpl.nasa.gov/planets/approx_pos.html>,
  <https://ssd.jpl.nasa.gov/about/>, <https://www.jpl.nasa.gov/jpl-image-use-policy/>

### JPL Horizons

<!-- attribution: id=horizons; keys=horizons,horizons.readme -->

- **What:** Position vectors of 8 planets and 18 moons, 1900 to 2100, to which
  our orbits are fitted.
- **By:** The JPL Solar System Dynamics group (the Horizons system).
- **Licence:** Not stated for the service's output on the pages read.
- **Attribution:** The SSD citation quoted in the entry above.
- **Upstream:** <https://ssd.jpl.nasa.gov/api/horizons.api>
- **Enters skymap:** `npm run fetch-horizons` → `data/raw/horizons/` →
  `npm run build-ephemeris-corrections` →
  `src/data/bodies/ephemerisCorrections.generated.ts`. Also the orbit rows of
  the spacecraft bodies (see each model's README).
- **Modified:** Yes. Only fitted correction series are shipped, not the vectors.
- **Checked:** 2026-10-07: <https://ssd.jpl.nasa.gov/about/>

### MCXC, the Meta-Catalogue of X-ray detected Clusters

<!-- attribution: id=mcxc; keys=mcxc.* -->

- **What:** Positions, redshifts, masses and radii of 1,743 galaxy clusters
  (VizieR J/A+A/534/A109).
- **By:** Piffaretti et al. 2011, A&A 534, A109.
- **Licence:** The ReadMe carries no copyright section. The CDS terms above
  apply: data from A&A "are free for a scientific usage".
- **Attribution:** Cite Piffaretti et al. 2011.
- **Upstream:** <https://cdsarc.cds.unistra.fr/ftp/J/A+A/534/A109/>
- **Enters skymap:** `npm run fetch-structures` → `data/raw/mcxc/mcxc.dat` →
  `tools/structures/buildStructures.ts` → `public/data/structure-catalog/`.
- **Modified:** Yes. Filtered by mass; hand-placed anchors win over catalogue
  rows near them.
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>

### MSCC, the Main SuperCluster Catalogue

<!-- attribution: id=mscc; keys=mscc.* -->

- **What:** 601 superclusters of Abell/ACO clusters (VizieR J/MNRAS/445/4073).
- **By:** Chow-Martínez et al. 2014, MNRAS 445, 4073.
- **Licence:** The ReadMe carries no copyright section. The CDS terms above
  refer to the journal's policy for MNRAS catalogues, which was not read.
- **Attribution:** Cite Chow-Martínez et al. 2014.
- **Upstream:** <https://cdsarc.cds.unistra.fr/ftp/J/MNRAS/445/4073/>
- **Enters skymap:** `npm run fetch-structures` → `data/raw/mscc/mscc.dat` →
  `tools/structures/buildStructures.ts`.
- **Modified:** Yes. Filtered by richness.
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>
- **Not verified:** the MNRAS policy on catalogues.

### Constellation lines (d3-celestial)

<!-- attribution: id=d3-celestial; keys=constellations.* -->

- **What:** Stick-figure vertices of the 88 constellations
  (`data/constellations.lines.json`, pinned commit in the README).
- **By:** Olaf Frohn.
- **Licence:** BSD 3-Clause. "Copyright (c) 2015, Olaf Frohn. All rights
  reserved."
- **Attribution:** The licence asks that redistributions keep the copyright
  notice, the conditions and the disclaimer; they are in
  `data/raw/constellations/README.md`.
- **Upstream:** <https://github.com/ofrohn/d3-celestial>
- **Enters skymap:** vendored at `data/raw/constellations/constellations.lines.json`
  → `tools/stars-rs` → `public/data/constellations.json`.
- **Modified:** Yes. Each vertex is resolved to a catalogued star's 3D position.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/ofrohn/d3-celestial/master/LICENSE>

### VizieR and the CDS services

<!-- attribution: id=vizier -->

- **What:** The catalogue service through which 2MASS XSC, Cosmicflows-4,
  Hipparcos, MCXC, MSCC and the S-star tables were fetched.
- **By:** CDS, Strasbourg. Ochsenbein, Bauer & Marcout 2000, A&AS 143, 23.
- **Licence:** The CDS terms quoted at the head of this section.
- **Attribution:** "This research has made use of the VizieR catalogue access
  tool, CDS, Strasbourg, France (DOI : 10.26093/cds/vizier). The original
  description of the VizieR service was published in 2000, A&AS 143, 23"
- **Upstream:** <https://vizier.cds.unistra.fr/>
- **Enters skymap:** `tools/fetch/fetch2massXsc.ts`, `fetchCosmicflows4.ts`,
  `fetchStructureCatalogs.ts`, `fetchGaia.ts` (build time only).
- **Modified:** Not applicable (a service).
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>

## Fields, volumes and structures

### CF4++ density and velocity grids (Cosmicflows-4)

<!-- attribution: id=cf4pp; keys=cf4.density-mean,cf4.vfield-mean,cf4.vfield-npz,cf4.dir; hosts=projets.ip2i.in2p3.fr -->

- **What:** Mean velocity and density on a 128³ grid in a 1000 Mpc box
  (`CF4pp_mean_std_grids.npz`), drawn as the flow field.
- **By:** Courtois et al. 2025 ([arXiv:2502.01308](https://arxiv.org/abs/2502.01308)),
  built on the Cosmicflows-4 distances of Tully et al. 2023.
- **Licence:** Not stated on the project's page.
- **Attribution:** "If you use this data cite the article above" (the page, of
  each download).
- **Upstream:** <https://projets.ip2i.in2p3.fr/cosmicflows/>
- **Enters skymap:** `data/raw/cf4/CF4pp_mean_std_grids.npz` (the two mean
  arrays are also hosted on R2 for contributors) → `npm run build-flow-field` →
  `public/data/scalar-field/v3/flowfield.scfd`.
- **Modified:** Yes. Two of the six arrays are packed to 16-bit floats.
- **Checked:** 2026-10-07: <https://projets.ip2i.in2p3.fr/cosmicflows/>

### SDSS Cosmic Slime value-added catalogue (MCPM density)

<!-- attribution: id=mcpm-vac; keys=mcpm.dir -->

- **What:** A 712×1200×728 density cube fitted to SDSS galaxies by the Monte
  Carlo Physarum Machine (`SDSS_z_44-476mpc`), drawn as the cosmic web glow.
- **By:** Wilde et al. 2023 ([arXiv:2301.02719](https://arxiv.org/abs/2301.02719));
  method: Burchett et al. 2020, Elek et al. 2021.
- **Licence:** It is an SDSS DR17 data product; SDSS states: "All SDSS data
  released in our public data releases is considered in the public domain."
- **Attribution:** Cite the papers above and SDSS DR17, with the SDSS-IV
  acknowledgement (see SDSS).
- **Upstream:** <https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold>
- **Enters skymap:** `tools/volumes/extractMcpmCube.py` (with pyslime) →
  `data/raw/mcpm/mcpm_sdss_d{2,4,8}.npy` (hosted on R2 for contributors) →
  `npm run build-mcpm` → `public/data/scalar-field/v3/mcpm-*.scfd`.
- **Modified:** Yes. Downsampled to three sizes, log-normalised, 16-bit.
- **Checked:** 2026-10-07: <https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold>,
  <https://www.sdss4.org/collaboration/#image-use>

### pyslime

<!-- attribution: id=pyslime -->

- **What:** The reader that decodes the catalogue's `trace.bin`; a maintainer
  step, not shipped.
- **By:** J. N. Burchett and contributors.
- **Licence:** BSD 3-Clause. "Copyright (c) 2017, J. Xavier Prochaska".
- **Attribution:** The licence's notice, for redistributions of the code;
  skymap redistributes none of it.
- **Upstream:** <https://github.com/jnburchett/pyslime>
- **Enters skymap:** imported by `tools/volumes/extractMcpmCube.py`.
- **Modified:** No.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/jnburchett/pyslime/master/LICENSE>

### Polyphorm and the Monte Carlo Physarum Machine

<!-- attribution: id=polyphorm; keys=polyphorm.dir,mcpm-workbench.* -->

- **What:** The software and method behind the density cubes. Three things in
  skymap descend from it: (1) the simulation kernels in
  `src/services/gpu/shaders/mcpm/`, which their own headers describe as a port
  of Polyphorm's D3D11 kernels ("the algorithm verbatim"), served on the
  `/mcpm/` workbench page; (2) five colour ramps in
  `src/data/volume/scalarFieldPalettes.ts`, sampled from Polyphorm's
  `palette_*.tga` files; (3) the hidden "Polyphorm (2MRS)" volume, a run of
  the software over 2MRS made by us, and cubes exported from the workbench.
- **By:** Oskar Elek, Joseph N. Burchett, J. Xavier Prochaska and Angus G.
  Forbes (Creative Coding Lab, UC Santa Cruz). Elek et al. 2021
  ([arXiv:2009.02441](https://arxiv.org/abs/2009.02441)); Burchett et al. 2020
  ([arXiv:1910.05344](https://arxiv.org/abs/1910.05344)).
- **Licence:** Not stated. The Polyphorm repository has no licence file and
  GitHub reports none for it. (PolyPhy, its successor, is MIT-licensed; the
  export format `polyphy-trace` read by `tools/parsers/polyphyTraceSidecar.ts`
  comes from a fork of it.)
- **Attribution:** None is asked in the repository's README; the app's Cosmic
  Web exhibit cites the two papers and links the repository.
- **Upstream:** <https://github.com/CreativeCodingLab/Polyphorm>
- **Enters skymap:** as listed under What; the 2MRS run through
  `tools/volumes/extractPolyphormExport.py` → `data/raw/polyphorm/` →
  `buildRhizomeVolume.ts`; workbench exports through
  `npm run promote-mcpm-workbench`.
- **Modified:** Yes. Kernels translated from HLSL to WGSL with storage buffers
  in place of 3D textures; ramps resampled to 12 anchors.
- **Checked:** 2026-10-07: <https://api.github.com/repos/CreativeCodingLab/Polyphorm>,
  <https://raw.githubusercontent.com/CreativeCodingLab/Polyphorm/master/README.md>,
  <https://api.github.com/repos/PolyPhyHub/PolyPhy>

### Edenhofer et al. 2024: 3D dust map

<!-- attribution: id=edenhofer; keys=edenhofer.* -->

- **What:** Dust extinction density out to 1.25 kpc from the Sun
  (`mean_and_std_healpix.fits`).
- **By:** Edenhofer, Zucker, Frank, Saydjari, Speagle, Finkbeiner & Enßlin
  2024, A&A 685, A82.
- **Licence:** Creative Commons Attribution 4.0 International (the Zenodo
  record).
- **Attribution:** Cite the paper and the dataset, doi:10.5281/zenodo.8187943.
- **Upstream:** <https://zenodo.org/records/8187943>
- **Enters skymap:** `data/raw/edenhofer/fetch_edenhofer.sh` →
  `tools/volumes/extractDustCube.py` → `buildDustVolume.ts` →
  `public/data/scalar-field/v3/edenhofer-dust-*.scfd` (shipped, with no layer
  drawing it yet).
- **Modified:** Yes. Resampled to a box at three sizes, de-biased, 16-bit.
- **Checked:** 2026-10-07: <https://zenodo.org/records/8187943>

### The Local Bubble shell (O'Neill et al. 2024)

<!-- attribution: id=local-bubble; keys=localbubble.* -->

- **What:** The surface of the Local Bubble, one radius per HEALPix direction
  (`ONeill2024_LocalBubble_ShellProperties_A0.5.fits`).
- **By:** O'Neill, Zucker, Goodman & Edenhofer 2024, "The Local Bubble is a
  Local Chimney" ([arXiv:2403.04961](https://arxiv.org/abs/2403.04961)).
- **Licence:** CC0 1.0 (the Harvard Dataverse record).
- **Attribution:** None required by CC0; cite the paper.
- **Upstream:** <https://doi.org/10.7910/DVN/INB1RB>
- **Enters skymap:** `npm run fetch-local-bubble` → `data/raw/localbubble/` →
  `public/data/local-bubble/v1/local-bubble.shell`.
- **Modified:** Yes. Baked to a triangle mesh with normals.
- **Checked:** 2026-10-07: <https://dataverse.harvard.edu/api/datasets/:persistentId/?persistentId=doi:10.7910/DVN/INB1RB>

### Filaments (DisPerSE)

<!-- attribution: id=disperse; keys=filaments.cache-dir -->

- **What:** The filament skeleton is computed by us from the 2MRS and GLADE
  galaxies with DisPerSE, run offline; the program is not shipped.
- **By:** Thierry Sousbie. Sousbie 2011 (as cited in `docs/DATA.md`).
- **Licence:** GitHub reports a licence it does not recognise for the
  repository ("Other"); its text was not read.
- **Attribution:** Cite Sousbie 2011.
- **Upstream:** <https://github.com/thierry-sousbie/DisPerSE>
- **Enters skymap:** `npm run build-filaments` → `data/raw/filaments/` →
  `public/data/filament/v1/filaments.bin`.
- **Modified:** Not applicable: the output is our own derived product.
- **Checked:** 2026-10-07: <https://api.github.com/repos/thierry-sousbie/DisPerSE>
- **Not verified:** DisPerSE's licence text.

## Imagery

### Curated galaxy thumbnails (`public/images/famous/*.webp`)

Per-galaxy famous-galaxy thumbnails come from two pipelines. Most entries are
now **hand-curated** via the famous-galaxy curator; a minority fall back to the
older auto-fetch path.

#### Curated overrides (primary source)

- **Use:** Hand-picked press and amateur-astrophotography images, one per
  famous-galaxy entry, selected through the curator tool
  (`tools/famous-curator`) and processed into a star-masked, radial-faded
  WebP trio under `public/images/famous-curated/<id>/`. The override index is
  `data/seeds/famous_curated_overrides.json`, which records the **`sourceUrl`,
  `license`, and `author`/credit line for every curated image** — that file is
  the authoritative per-entry attribution record.
- **Source institutions** present in the current override set:
  - **NOIRLab / NOAO** (KPNO, CTIO, and legacy NOAO press images,
    <https://noirlab.edu/public/images/>) — credit lines of the form
    "KPNO/NOIRLab/NSF/AURA/…".
  - **ESO — European Southern Observatory** (<https://www.eso.org/public/images/>),
    used with ESO's required attribution.
  - **Vera C. Rubin Observatory** ("RubinObs/NOIRLab/SLAC/NSF/DOE/AURA").
  - **ESA / Hubble & NASA** public-domain press releases.
  - **ESA / Euclid / Euclid Consortium** (NGC 6822), CC BY-SA 3.0 IGO.
  - **Sloan Digital Sky Survey** image cutouts.
  - **Wikimedia Commons** uploads (most curated entries link an
    `en.wikipedia.org/.../media/File:` page), authored by individual
    astrophotographers — e.g. Adam Block / Mount Lemmon SkyCenter /
    University of Arizona, Chuck Ayoub, and others named in the override file.
  - **Digitized Sky Survey 2 (DSS2)** frames for a few low-surface-brightness
    dwarfs.
- **Licences:** recorded per entry; the current set spans CC0, CC BY (2.0–4.0),
  CC BY-SA (3.0–4.0), and public domain.
- **Unresolved licences:** three entries currently carry `"license": "unknown"`
  in the override file (at the time of writing: `c17` and `c18`, both DSS2 /
  amateur frames via theskylive.com; and `c29`, a `noirlab.edu` sourceUrl that
  is de-facto CC BY 4.0 per NOIRLab's blanket clause below but hasn't been
  recorded as such). These must be resolved to a concrete licence — or the
  image replaced — before `public/images/famous*/` is redistributed as a
  standalone published artefact. (All `noirlab.edu`-sourced entries are CC BY
  4.0 per NOIRLab's image licence.)

#### Auto-fetch fallback (Wikipedia → DESI Legacy)

For entries without a curated override, `tools/famous/fetchFamousImages.ts`
fetches a thumbnail automatically, recording the source per-entry in
`data/raw/wikipedia_famous_cache.json`:

- **Wikipedia / Wikimedia Commons** — the Wikipedia REST
  `/page/summary/<title>` endpoint's `originalimage.source`, resized +
  radial-faded. Licences are a mix of CC-BY-SA 4.0, CC-BY 4.0, public-domain
  (NASA / ESA / Hubble), and ESO with required attribution; the cache JSON
  retains the full API response so the attribution chain back to the
  Commons upload page is reconstructible.
- **DESI Legacy Imaging Surveys** — sky cutouts from
  <https://www.legacysurvey.org/viewer/cutout.jpg> (fallback chain
  `ls-dr10` → `sdss` → `unwise-neo7`) for entries Wikipedia failed to provide.
  Reference: Dey et al. 2019, AJ 157, 168. The Legacy Surveys data combines
  imaging from DECaLS (Dey, Schlegel, Lang et al.), MzLS (Silva, Lang et al.),
  BASS (Zou, Zhou et al.), and unWISE (Lang, Hogg, Schlegel); acknowledgements
  per <https://www.legacysurvey.org/acknowledgment/>.

**Caution for redistribution:** if `public/images/famous*/` is ever
redistributed as a published binary, each individual image's attribution
string + licence should be enumerated in a per-file table or sidecar (the
override file already holds this for curated entries). The CC-BY-SA portion in
particular forces share-alike on derivative atlases, and the `unknown`-licence
entries above must be resolved first.

### Galaxy descriptions

The 1–3 sentence editorial blurbs in the famous-galaxy InfoCard come from
two sources:

- **20 hand-curated entries** (M31, M33, M51, M81, M82, M104, etc.) — written
  by the project author, MIT-licensed alongside the rest of the source.
- **~50 auto-extracted entries** — the `extract` field of the Wikipedia REST
  `/page/summary/<title>` response. CC-BY-SA 4.0; attribution chain back
  to the Wikipedia article is recorded in
  `data/raw/wikipedia_famous_cache.json`.

### Planetary, lunar & ring surface textures

The textured solar-system bodies (`src/data/bodies/bodyTextureRegistry.ts`) and
the ≤1 MB boot placeholder atlas (`public/data/images/textures/body-atlas.webp`,
a 13-tile mosaic emitted by `tools/textures/buildTextures.ts`) are derived —
downsampled into runtime tiers, and in two cases baked into normal maps — from
three public sources. The raw sources are gitignored; per-file provenance,
upstream URLs, and licences live in `tools/utils/io/rawDataRegistry.ts`
(the `textures.*` rows) and `tools/utils/io/textureSources.ts`.

#### Solar System Scope — planet & moon albedo maps

- **Use:** Full-colour equirectangular surface maps for Mercury, Venus (cloud
  tops), Mars, Jupiter, Saturn, Uranus, Neptune, and the Moon, plus the Saturn
  ring radial-alpha strip.
- **Source:** <https://www.solarsystemscope.com/textures/>.
- **Licence:** CC BY 4.0. Attribution: "Textures by Solar System Scope
  (solarsystemscope.com), licensed under CC BY 4.0."

#### NASA — Earth & Moon imagery

All public domain; NASA asks that credit go to the named observatory / program.

- **Earth surface** — Blue Marble Next Generation (August 2004 topography +
  bathymetry), NASA Earth Observatory (<https://visibleearth.nasa.gov/>). Both the
  whole-globe base texture and the streamed surface tile pyramid come from this
  one month, the former from the 21600×10800 equirect and the latter from the
  eight 21600×21600 quadrants.
- **Earth night lights** — Black Marble 2016, NASA Earth Observatory / NASA
  Goddard Space Flight Center, Suomi NPP VIIRS.
- **Earth water mask** (feeds the material/roughness map) — Blue Marble Next
  Generation land/water mask, NASA Earth Observatory. Preserved via the Internet
  Archive after NASA retired the NEO bluemarble archive.
- **Earth relief** (baked into the normal map — a build input, never shipped as
  runtime pixels) — GEBCO_08-derived grayscale topography/bathymetry, NASA Earth
  Observatory, imagery by Jesse Allen using GEBCO_08 grid data.
- **Earth clouds** — Blue Marble cloud composite, NASA Goddard Space Flight
  Center, Reto Stockli.
- **Moon relief** (baked into the normal map — a build input, never shipped as
  runtime pixels) — NASA Scientific Visualization Studio "CGI Moon Kit" LOLA
  elevation.

#### EOX IT Services — EOxCloudless (Sentinel-2)

- **Use:** A second, deeper surface tile band (z8–z13) over a set of
  world-wide regions (cities including Copenhagen, Amsterdam, and Tokyo;
  landmarks including the Grand Canyon and Mount Everest — see
  [`eoxRegions.ts`](tools/fetch/eoxRegions.ts) for the full list), layered on
  top of the whole-globe Blue Marble band above — flying down over one of
  those regions resolves Sentinel-2 detail instead of stopping at Blue
  Marble's z7 floor.
- **Source:** <https://cloudless.eox.at>, EOX IT Services GmbH. The
  `s2cloudless-2025` layer is used.
- **Licence:** CC BY-NC-SA 4.0 upstream; used with written permission from
  EOX IT Services GmbH (email, September 2026). Attribution: "EOxCloudless
  https://cloudless.eox.at by EOX IT Services GmbH (Contains modified
  Copernicus Sentinel data 2025). Published under CC BY-NC-SA 4.0; used in
  skymap with written permission from EOX IT Services GmbH."

#### GeoDanmark / Klimadatastyrelsen — orthophoto (Søndermarken)

- **Use:** A third, deepest surface tile band (z14–z19) over Søndermarken,
  Copenhagen, layered on top of the EOX band above — flying down over that
  patch resolves 10 cm/px orthophoto detail instead of stopping at EOX's z13
  floor. Leaving the patch drops back to EOX z13 with no on-screen indication.
- **Source:** `wms.datafordeler.dk`, Datafordeler / Klimadatastyrelsen. Layer
  `geodanmark_2025_10cm`, vintage forår (spring) 2025.
- **Licence:** CC BY 4.0. Attribution: "Ortofoto © GeoDanmark /
  Klimadatastyrelsen (CC BY 4.0)."

#### USGS Astrogeology — Galilean moon mosaics

- **Use:** Global surface mosaics for Io, Europa, Ganymede, and Callisto
  (Voyager + Galileo SSI). Europa and Callisto ship single-channel and are
  hue-tinted at build time (the `monoTint` treatment in the body-texture registry).
- **Source:** USGS Astrogeology Science Center,
  <https://planetarymaps.usgs.gov/>.
- **Licence:** Public domain. Credit: "NASA / USGS".

#### USGS Astrogeology — Enceladus mosaic (Cassini)

- **Use:** Global surface mosaic for Enceladus (Cassini), 110 m/px. It ships
  single-channel and is a relief-shading mosaic rather than an albedo map, so
  the build applies both the `monoTint` hue and an additive brightness `lift`
  (Enceladus is near-uniform bright ice).
- **Source:** USGS Astrogeology Science Center,
  <https://planetarymaps.usgs.gov/>.
- **Licence:** Public domain. Credit: "NASA/JPL/Space Science Institute",
  publisher USGS Astrogeology.

#### NASA Photojournal — Saturn moon colour maps (Cassini, 2014)

- **Use:** Global surface maps for Mimas, Tethys, Dione, Rhea and Iapetus
  (PIA18437, PIA18439, PIA18434, PIA18438, PIA18436). Their colour is enhanced
  into the UV and IR, so the build keeps luminance only and applies a
  `monoTint` hue and `lift`; each map is re-centred from 180° to the prime
  meridian.
- **Source:** NASA Photojournal, <https://photojournal.jpl.nasa.gov/>; mosaics
  assembled by Paul Schenk (Lunar and Planetary Institute).
- **Licence:** Public domain. Credit: "NASA/JPL-Caltech/Space Science
  Institute/Lunar and Planetary Institute".

#### NASA PDS Small Bodies Node — Gaskell shape models (Mimas, Tethys, Dione)

- **Use:** Each moon's relief, baked into its normal map (a build input, never
  shipped as runtime pixels).
- **Source:** "Gaskell Mimas / Tethys / Dione Shape Model",
  <https://sbnarchive.psi.edu/pds4/non_mission/gaskell.mimas.shape-model/>
  (and `gaskell.tethys.shape-model`, `gaskell.dione.shape-model`).
- **Licence:** Public domain. Credit: "Robert Gaskell / NASA PDS Small Bodies
  Node".

#### NASA PDS / Paul Schenk (LPI) — Enceladus global DEM (Cassini)

- **Use:** Enceladus's relief, baked into its normal map (a build input, never
  shipped as runtime pixels).
- **Source:** "Enceladus Cassini Global DEM 200m Schenk" (Lunar and Planetary
  Institute/USRA; published by the Planetary Data System 2024-08-12,
  distributed by USGS Astrogeology),
  <https://astrogeology.usgs.gov/search/map/enceladus-cassini-global-dem-200m-schenk>.
- **Licence:** No access constraints; use constraint "Please cite authors".
  Citation: Schenk, P. M. & McKinnon, W. B. (2024), "New global topography of
  Enceladus: Hypsometry, basins, spherical harmonics, shell thickness, and true
  polar wander revisited", _Icarus_ 408,
  <https://doi.org/10.1016/j.icarus.2023.115827>.

#### Paul Schenk (LPI): Uranian satellite mosaics and DEMs (Voyager 2)

- **Use:** Global surface mosaics for Miranda, Ariel, Umbriel, Titania and
  Oberon (shipped as greyscale body textures, unseen areas filled flat grey),
  and the Miranda and Ariel DEMs, baked into their normal maps (the
  DEMs are a build input, never shipped as runtime pixels). Based on Voyager 2
  images (NASA/JPL).
- **Source:** "Uranian Satellite Global Mosaics and Digital Elevation Models",
  Paul Schenk, 2020, USRA Houston Repository, hdl:20.500.11753/1687,
  <https://repository.hou.usra.edu/handle/20.500.11753/1687>.
- **Licence:** Not public domain. The repository readme states no licence; it
  asks users to cite and to contact the author. Citation: Schenk, P., and J.
  Moore (2020), "Topography and Geology of Uranian Mid-sized Icy Satellites in
  Comparison with Saturnian and Plutonian Satellites", _Phil. Trans. R. Soc. A_
  378, 20200102.

#### USGS Astrogeology — Pluto/Charon mosaics (New Horizons)

- **Use:** Global surface mosaics for Pluto and Charon (LORRI + MVIC), 300 m/px
  equirectangular, 8-bit stretched from the 32-bit originals. Both ship
  single-channel. Charon is hue-tinted at build time (the `monoTint` treatment
  in the body-texture registry); Pluto's mosaic instead supplies luminance for
  the `panSharpen` treatment below — a derived product, neither the raw mosaic
  nor the raw NASA colour map.
- **Source:** USGS Astrogeology Science Center,
  <https://planetarymaps.usgs.gov/>.
- **Licence:** Public domain (Astropedia access constraints: none; use constraints: cite authors).
  Credit per the Astropedia record: "New Horizons Team" (primary author), originators "NASA,
  Johns Hopkins University Applied Physics Laboratory, Southwest Research Institute, Lunar and
  Planetary Institute", published by USGS Astrogeology Science Center, 2017.

#### USGS Astrogeology — Triton Voyager 2 colour mosaic (Paul Schenk)

- **Use:** Global surface texture for Triton, 600 m/px, shipped with its colours
  as published. The northern hemisphere, unlit when Voyager 2 flew by, is
  filled with the mean colour of the rest of the map.
- **Source:** "Triton Voyager 2 Color Mosaic, Global Fill, 600 m", Paul Schenk
  (Lunar and Planetary Institute, 2014; NASA PIA18668), from Voyager 2 images
  (NASA/JPL); published by USGS Astrogeology Science Center,
  <https://planetarymaps.usgs.gov/mosaic/Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif>.
- **Licence:** Public domain (NASA imagery); credit NASA/JPL/Lunar and Planetary
  Institute and Paul Schenk.

#### Paul Schenk (LPI): Triton topographic map (Voyager 2)

- **Use:** The shape-from-shading height map of Triton (lon -70 to 95, lat -21 to
  46), baked into its normal map; a build input, never shipped as runtime pixels.
- **Source:** "Topographic map of Triton from shape-from-shading information",
  USRA Houston Repository,
  <https://repository.hou.usra.edu/items/97fc385d-8a66-4120-b3b7-f35562877a94>.
- **Licence:** Not public domain; no licence is stated. Citation: Schenk, P., et al.
  (2021), "Triton: Topography and Geology of a Probable Ocean World with Comparison
  to Pluto and Charon", _Remote Sensing_ 13, 3476.

#### NASA — Pluto derived colour (New Horizons MVIC)

- **PIA11707** — New Horizons global colour map of Pluto, which NASA describes
  as "based on a series of three color filter images obtained by the
  Ralph/Multispectral Visual Imaging Camera". NASA attaches no colour-type
  label to it, so that it is **enhanced** rather than natural colour is an
  inference, from two independent things. (a) Olkin et al. 2017, _AJ_ 154, 258,
  say of their own renderings from that same three-broadband-filter set — blue,
  red and near-IR "displayed in the blue, green, and red color channels,
  respectively" — that "These images are enhanced color (not natural color as
  perceived by the human eye)"; the paper never mentions PIA11707, so this
  carries only as far as the product family. (b) We measured it: fitting
  PIA11707's chroma against the true-colour image below recovers a ~6.4×
  anisotropic chroma stretch, so the two renderings of the same data
  demonstrably disagree on saturation. skymap uses PIA11707 only as a chroma
  source — that fitted calibration inverts the stretch before any pixels reach
  a runtime texture, and PIA11707 itself is never shipped.
  **Source:** NASA Photojournal (PIA11707),
  <https://science.nasa.gov/photojournal/pluto-color-map> (the legacy
  `photojournal.jpl.nasa.gov/catalog/PIA11707` URL now redirects here).
  **Licence:** Public domain. **Credit:** NASA/JHUAPL/SwRI.
- **"True Colors of Pluto"** (P_COLOR_2_TRUE_COLOR) — natural-colour New
  Horizons MVIC disc view, of which NASA's page says "The processing creates
  images that would approximate the colors that the human eye would perceive".
  Used only as the calibration reference the PIA11707 chroma-inversion fit is
  derived against (not a build input, kept for reproducibility). **Source:**
  <https://science.nasa.gov/resource/true-colors-of-pluto/>. **Licence:**
  Public domain. **Credit:** NASA/JHUAPL/SwRI/Alex Parker.

### "Livyatan melvillei" — Major

- **Use:** The whale in the pair of mesh bodies orbiting Earth (the
  Hitchhiker's Guide easter egg). Shipped as a derivative:
  `npm run build-meshes` de-rigs the model, merges its primitives and resizes
  its textures into `public/data/meshes/whale.*`. The raw GLB is gitignored;
  per-file provenance lives in `tools/utils/io/rawDataRegistry.ts` (the
  `meshes.*` rows) and `data/raw/meshes/whale/README.md`.
- **Source:**
  <https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba>,
  by Major (<https://sketchfab.com/majorgalah>).
- **Licence:** CC BY 4.0. Required attribution, verbatim:

  > This work is based on "Livyatan melvillei" (https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba) by Major (https://sketchfab.com/majorgalah) licensed under CC-BY-4.0

### "Flowers Petunia White" — Marianne Goudriaan

- **Use:** The bowl of petunias trailing the whale. Shipped as a derivative:
  a headless Blender import (`npm run import-mesh -- petunias`) and pre-bake
  (`npm run prebake-mesh -- petunias`) bake the author's six textures into one
  set of PBR atlases, which
  `npm run build-meshes` then bakes to `public/data/meshes/petunias.*`. The raw
  GLB and the pre-bake output are gitignored; provenance lives in
  `tools/utils/io/rawDataRegistry.ts` and `data/raw/meshes/petunias/README.md`.
- **Source:** <https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0>,
  by Marianne Goudriaan (<https://sketchfab.com/mariannegoudriaan>).
- **Licence:** CC BY 4.0. Required attribution, verbatim:

  > This work is based on "Flowers Petunia White" (https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0) by Marianne Goudriaan (https://sketchfab.com/mariannegoudriaan) licensed under CC-BY-4.0

### "Voyager Probe (B)" — NASA / Michael D. Carbajal

- **Use:** The Voyager 1 and Voyager 2 mesh bodies (both `meshKey: 'voyager'`).
  Shipped as a derivative: a headless Blender pre-bake
  (`npm run prebake-mesh -- voyager`) flattens the scene to one mesh and one
  albedo atlas, which `npm run build-meshes` then bakes to
  `public/data/meshes/voyager.*`. The raw GLB and the pre-bake output are
  gitignored; provenance and the pre-bake's own steps live in
  `tools/utils/io/rawDataRegistry.ts` and `data/raw/meshes/voyager/README.md`.
- **Source:** NASA 3D Resources,
  <https://science.nasa.gov/3d-resources/voyager-probe-b/> (download served
  from `assets.science.nasa.gov`).
- **Licence:** Public domain under NASA's media usage guidelines — see
  <https://www.nasa.gov/nasa-brand-center/images-and-media>.
- **Credit:** NASA / Michael D. Carbajal (NASA Headquarters).

### "Mars 2020 Perseverance Rover" — Brian Kumanchik, NASA/JPL-Caltech

- **Use:** The Perseverance mesh body. Shipped as a derivative: a headless
  Blender pre-bake (`npm run prebake-mesh -- perseverance`) flattens the
  deployed rig to one mesh and one albedo atlas, which `npm run build-meshes`
  then bakes to `public/data/meshes/perseverance.*`. The raw GLB and the
  pre-bake output are gitignored; provenance and the pre-bake's own steps live
  in `tools/utils/io/rawDataRegistry.ts` and
  `data/raw/meshes/perseverance/README.md`.
- **Source:** NASA 3D Resources,
  <https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/>
  (download served from `assets.science.nasa.gov`).
- **Licence:** Public domain under NASA's media usage guidelines — see
  <https://www.nasa.gov/nasa-brand-center/images-and-media>.
- **Credit:** Brian Kumanchik, NASA/JPL-Caltech.

### "Curiosity Rover (MSL) (Clean)" — Brian Kumanchik, NASA/JPL-Caltech

- **Use:** The Curiosity mesh body. Shipped as a derivative: a headless
  Blender pre-bake (`npm run prebake-mesh -- curiosity`) flattens the deployed
  rig to one mesh and one albedo atlas, which `npm run build-meshes` then bakes
  to `public/data/meshes/curiosity.*`. The raw archive and the pre-bake output
  are gitignored; provenance and the pre-bake's own steps live in
  `tools/utils/io/rawDataRegistry.ts` and `data/raw/meshes/curiosity/README.md`.
- **Source:** NASA 3D Resources,
  <https://science.nasa.gov/3d-resources/curiosity-rover-msl/> (download
  served from `assets.science.nasa.gov`, a zip archive holding one `.blend`
  file).
- **Licence:** Public domain under NASA's media usage guidelines — see
  <https://www.nasa.gov/nasa-brand-center/images-and-media>.
- **Credit:** Brian Kumanchik, NASA/JPL-Caltech.

### "Mars Exploration Rover - Spirit and Opportunity" — NASA/JPL-Caltech

- **Use:** The Spirit and Opportunity mesh bodies (both `meshKey: 'mer'`) —
  the same vehicle design, so both bodies draw this one model. Shipped as a
  derivative: a headless Blender pre-bake (`npm run prebake-mesh -- mer`)
  flattens the deployed rig to one mesh and one albedo atlas, which
  `npm run build-meshes` then bakes to `public/data/meshes/mer.*`. The raw
  `.blend` and the pre-bake output are gitignored; provenance and the
  pre-bake's own steps live in `tools/utils/io/rawDataRegistry.ts` and
  `data/raw/meshes/mer/README.md`.
- **Source:** NASA 3D Resources page
  <https://science.nasa.gov/3d-resources/mars-exploration-rover-spirit-and-opportunity/>;
  the page's own download link 404s (verified 2026-09-11), so the file is
  fetched from NASA's own GitHub mirror of the same collection,
  <https://github.com/nasa/NASA-3D-Resources>.
- **Licence:** Public domain under NASA's media usage guidelines — see
  <https://www.nasa.gov/nasa-brand-center/images-and-media>.
- **Credit:** NASA/JPL-Caltech.

## Fonts

### Cormorant Garamond — display serif

- **Use:** The label font. Vendored as `CormorantGaramond-SemiBold.ttf` in two
  places — `data/raw/fonts/` (baked into the MSDF label atlas by
  `tools/fonts/buildFontAtlas.ts`) and `tools/site/fonts/` (rasterised into
  `public/og-image.jpg` by `tools/site/makeOgImage.ts`) — and additionally
  self-hosted as a subsetted `public/fonts/CormorantGaramond-SemiBold.woff2`
  (`@font-face` in `src/styles/global.css`) for the 2D UI chrome
  (`--font-family-display`), rather than loaded from Google Fonts.
- **Designer:** Christian Thalmann (Catharsis Fonts).
- **Source:** <https://fonts.google.com/specimen/Cormorant+Garamond>.
- **Licence:** SIL Open Font License 1.1.

## Shaders

### Milky Way impostor — "Spiral galaxy" by mrange

The volumetric raymarched fragment shader at the heart of
`src/services/gpu/shaders/milkyWayImpostor.wgsl` is a port of the
"Spiral galaxy" ShaderToy by **mrange**.

- **Original:** https://www.shadertoy.com/view/wsBBWD
- **Author profile:** https://www.shadertoy.com/user/mrange
- **Licence:** CC0 (public domain dedication, declared in the original
  source's leading `// License CC0: Spiral galaxy` comment).
- **Use:** WGSL port serves as the procedural Milky Way at the world
  origin so the user has a meaningful "here" to anchor on. The vertex
  stage was rewritten from the ground up to use a world-anchored view-
  aligned billboard driven by the engine's real camera; the fragment
  stage's raymarched render logic (bulge sphere, exponential disk,
  star-cell sampling, dust integral) is structurally a line-by-line
  port with WGSL-syntax adjustments and skymap-specific output
  sanitisation (NaN masking, disk-extent envelope). Display-space
  post-processing (gamma, contrast, vignette) was deleted so the
  engine's HDR tone-map pass can run on a clean linear-light input.

### Atmospheres — Bruneton & Neyret 2008, Hillaire 2020

- **Use:** Method reference, no code reused. The three-LUT atmosphere pipeline
  (`src/services/gpu/shaders/atmosphere/`) follows Bruneton's transmittance-LUT
  horizon-packing (r, mu) uv parametrisation (`scattering.wesl`,
  `transmittanceLut.wesl`) and Hillaire's closed-form single-order
  approximation of the multiple-scattering series (`multiScatterLut.wesl`);
  the shell fragment's segment-transmittance ratio (`shell/fragment.wesl`) is
  Bruneton's ratio identity. `AtmosphereShellRenderer.d.ts` and
  `atmosphereParams.ts` describe the same three-LUT structure.
- **Reference:** Bruneton, E. & Neyret, F. 2008, "Precomputed Atmospheric
  Scattering", EGSR / Computer Graphics Forum 27(4); reference implementation
  <https://github.com/ebruneton/precomputed_atmospheric_scattering> (BSD-3).
  Hillaire, S. 2020, "A Scalable and Production Ready Sky and Atmosphere
  Rendering Technique", EGSR / Computer Graphics Forum 39(4),
  <https://sebh.github.io/publications/egsr2020.pdf>.
- **Licence:** Both papers are cited above; no code from either is reused, so
  no licence obligation applies beyond citation.

### Sgr A\* lens — Bruneton 2020

- **Use:** Reference and audit baseline only — no code reused. The Sgr A\*
  lens computes its own Schwarzschild bending-angle LUT by quadrature
  (`src/utils/lensing/buildSchwarzschildDeflectionLut.ts`) and its own march
  (`src/services/gpu/shaders/bodies/sgrAStarLensing/fragment.wesl`), design
  descended from an earlier in-repo NFW lens LUT. Bruneton's paper informed
  the backward-lookup convention (rotate the escape ray toward the hole by
  the bending angle) and served as the comparison baseline for the
  emission-disk and LUT math audit during development.
- **Reference:** Eric Bruneton, "Real-time High-Quality Rendering of
  Non-Rotating Black Holes," 2020, [arXiv:2010.08735](https://arxiv.org/abs/2010.08735);
  reference implementation <https://github.com/ebruneton/black_hole_shader>.
- **Licence:** BSD-3-Clause (reference implementation).

## Vendored data

### d3-celestial — constellation line data

- **Use:** IAU constellation stick-figure vertices, vendored at
  `data/raw/constellations/constellations.lines.json` and resolved at build
  time to real 3D star positions, shipped as `public/data/constellations.json`.
- **Source:** [d3-celestial](https://github.com/ofrohn/d3-celestial) by
  Olaf Frohn, `data/constellations.lines.json`.
- **Licence:** BSD-3-Clause.

## External services / APIs

These services are queried at build-time or read-only at runtime; no data
flows from skymap to them.

- **Wikipedia REST API** (`https://en.wikipedia.org/api/rest_v1/page/summary/...`)
  — descriptions + images for the famous-galaxy enrichment pass.
  Wikipedia content is CC-BY-SA 4.0.
- **HyperLEDA fG.cgi** (`http://atlas.obs-hp.fr/hyperleda/fG.cgi`) — used by
  `tools/fetchHyperLeda.ts` and `tools/expandFamousFromCatalogs.ts` to fetch
  per-galaxy metadata.
- **DESI Legacy viewer cutouts**
  (`https://www.legacysurvey.org/viewer/cutout.jpg`) — used by
  `tools/fetchFamousImages.ts` for the thumbnail fallback path.
- **VizieR TAP** (`https://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync`) —
  used by `tools/fetch2massXsc.ts` to fetch 2MASS XSC shape data via ADQL, and
  as the one-off source for the hand-transcribed Gillessen S-star tables (and
  the check that verified that transcription). CDS asks that use of VizieR be
  acknowledged: "This research has made use of the VizieR catalogue access
  tool, CDS, Strasbourg, France (DOI: 10.26093/cds/vizier)." The original
  description of the service is Ochsenbein, Bauer & Marcout 2000, A&AS 143, 23.
- **NED — NASA/IPAC Extragalactic Database**
  (`https://ned.ipac.caltech.edu/byname?objname=…`) — linked from the
  InfoCard "Catalogues" row for famous galaxies. Read-only; no programmatic
  access at build time.

## NPM dependencies

The runtime + build-time JavaScript dependencies are listed in
[`package.json`](package.json). Notable third-party libraries:

- **react / react-dom** (MIT) — UI framework.
- **wgpu-matrix** (MIT) — vector / matrix math.
- **vite** (MIT) — dev server + bundler.
- **vitest** (MIT) — test runner.
- **@vitejs/plugin-react** (MIT) — React refresh / JSX transform.
- **@webgpu/types** (BSD-3) — WebGPU TypeScript declarations.
- **typescript** (Apache-2.0) — typechecker / transpiler.
- **prettier** (MIT) — code formatter.
- **sharp** (Apache-2.0) — image processing for the thumbnail pipeline.
- **tsx** (MIT) — TypeScript runner for tools scripts.
- **@types/\* packages** (MIT) — type stubs.

Each dependency's licence and full attribution is enumerated in its own
`node_modules/<package>/LICENSE` after `npm install`.
