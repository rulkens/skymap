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

## Galaxy imagery

### Curated galaxy photographs (78 images)

<!-- attribution: id=famous-curated; keys=famous.curated,famous.source-cache-dir -->

- **What:** One press or amateur photograph per well-known galaxy, shipped
  under `public/images/famous-curated/<id>/`, `public/images/famous/` and
  `public/images/famous-thumb/`.
- **By:** Many authors. `data/seeds/famous_curated_overrides.json` holds the
  `sourceUrl`, `license` and `author` of every image and is the per-image
  record; each `recipe.json` beside an image repeats them.
- **Licence:** Per image. The 59 images taken from Wikimedia Commons carry, on
  Commons today, exactly the licence recorded for them: CC BY 4.0 (27), CC
  BY-SA 4.0 (7), CC0 (7), CC BY 3.0 (4), CC BY-SA 3.0 US (4), public domain
  (4), CC BY 2.0 (3), CC BY-SA 3.0 (2), CC BY-SA 3.0 IGO (1). The 16 from
  NOIRLab fall under its statement: "Unless specifically noted, the images, and
  videos distributed on the public NOIRLab website … are licensed under a
  Creative Commons Attribution 4.0 International License". One is from
  ESA/Hubble, whose images "are released under the Creative Commons Attribution
  4.0 International license". Two (`c17`, `c18`) are Digitized Sky Survey
  frames taken from theskylive.com; see the open points below.
- **Attribution:** The `author` string of each record, with its licence. NOIRLab:
  "Crediting this image with the full credit line, in a visible way is
  MANDATORY". ESA/Hubble and ESO: the full credit, "with the wording
  unaltered". The ShareAlike licences (14 images) ask that adaptations be
  shared under the same licence.
- **Upstream:** the `sourceUrl` of each record.
- **Enters skymap:** `tools/famous-curator` (`npm run curate-famous`) →
  `public/images/famous-curated/`, loaded by the galaxy thumbnail layer.
- **Modified:** Yes. Cropped, stars removed with StarNet2, sky faded to
  transparent, optionally deprojected, resized to WebP.
- **Checked:** 2026-10-07: <https://commons.wikimedia.org/w/api.php> (the
  stated licence of each of the 59 files), <https://noirlab.edu/public/copyright/>,
  <https://noirlab.edu/public/images/noao-n5005magnani/>,
  <https://noirlab.edu/public/images/noao-m88quinn/>,
  <https://noirlab.edu/public/images/noao-m91/>,
  <https://noirlab.edu/public/images/noao-m94/>,
  <https://esahubble.org/copyright/>, <https://www.eso.org/public/copyright/>,
  <https://archive.stsci.edu/publishing/data-use>
- **Not verified:** theskylive.com (refused the request), so the source of
  `c17` and `c18`; the ESA/Hubble page of `leda1313424`
  (`esahubble.org/images/opo2506a/` answered 404); 12 of the 16 NOIRLab image
  pages.

Open points in the per-image record, left as they are for the owner:

- `c29` (NGC 5005) is recorded `"license": "unknown"`. Its NOIRLab page gives
  the credit "KPNO/NOIRLab/NSF/AURA/Ray and Emily Magnani/Adam Block" and no
  note that sets it apart from NOIRLab's CC BY 4.0 statement.
- `m88` and `m91` are recorded as public domain and `m94` as "CC 4.0". Their
  NOIRLab pages carry no such note either; NOIRLab's statement is CC BY 4.0.
- `c17` (NGC 147) and `c18` (NGC 185) are recorded `"license": "unknown"`,
  author "Digital Sky Survey" / "Digitized Sky Survey 2". If they are DSS
  frames, the terms are those quoted under "Digitized Sky Survey cutouts"
  below: copyrighted, free for non-profit use, commercial use "prohibited
  without written permission from the copyright holder(s)".

### Galaxy photographs fetched from Wikipedia (3 images) and galaxy descriptions

<!-- attribution: id=wikipedia; keys=famous.wikipedia-cache; hosts=en.wikipedia.org -->

- **What:** The lead image of the Wikipedia article for the three listed
  galaxies with no curated photograph (`c52`, `c53`, `c61`), and the
  article's opening sentences as the description of about 50 galaxies. The
  app's cards also link to Wikipedia articles.
- **By:** Wikipedia contributors; the images' authors on Wikimedia Commons.
- **Licence:** Text: CC BY-SA 4.0 (and GFDL), per the Wikimedia Terms of Use.
  Images, as Commons states today: `c52` NGC 4697, CC BY-SA 3.0 (author given
  as "Own work", from Hubble Legacy Archive data); `c53` NGC 3115, public
  domain (X-ray: NASA/CXC/Univ. of Alabama/K. Wong et al; Optical: ESO/VLT);
  `c61` Antennae Galaxies, CC BY 4.0 (ESA/Hubble & NASA).
- **Attribution:** For text, a link to the article is one of the forms the
  Terms of Use accept; the cards link it. For images, author and licence as
  above.
- **Upstream:** `https://en.wikipedia.org/api/rest_v1/page/summary/<title>`
- **Enters skymap:** `tools/famous/fetchFamousImages.ts` →
  `data/raw/famous/wikipedia_famous_cache.json` → `public/images/famous/` and
  `famous_galaxies_meta.json`; descriptions also sit in
  `data/seeds/famous_galaxies.seed.json`.
- **Modified:** Images resized and faded at the edge; text taken as is.
- **Checked:** 2026-10-07: <https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use>,
  <https://commons.wikimedia.org/w/api.php> (the three files)

### DESI Legacy Imaging Surveys cutouts (fallback, none shipped today)

<!-- attribution: id=legacy-surveys -->

- **What:** The fetcher's second choice when Wikipedia has no image: a cutout
  from the Legacy Surveys viewer (`ls-dr10`, then `sdss`, then `unwise-neo7`).
  All 81 listed galaxies have a curated or Wikipedia image today.
- **By:** The DESI Legacy Imaging Surveys (Dey et al. 2019, AJ 157, 168).
- **Licence:** The viewer states: "Each survey has its own copyright and
  licensing terms … For any usage of images, the user is responsible for
  ensuring that they are in compliance with any licensing terms for the
  relevant layer."
- **Attribution:** Per layer; the page under Checked lists each survey's policy.
- **Upstream:** <https://www.legacysurvey.org/viewer/cutout.jpg>
- **Enters skymap:** `tools/famous/fetchFamousImages.ts` (build time).
- **Modified:** Would be resized and faded, as above.
- **Checked:** 2026-10-07: <https://www.legacysurvey.org/acknowledgment/>

### SDSS image cutouts (fetched while the app runs)

<!-- attribution: id=sdss-images; hosts=skyserver.sdss.org -->

- **What:** A JPEG cutout of a galaxy that has no curated photograph, asked
  from SkyServer DR18 when it grows large on screen; the cards also link to
  SkyServer's object pages.
- **By:** The Sloan Digital Sky Survey.
- **Licence:** "We provide all images on a Creative Commons Attribution license
  (CC-BY). Any SDSS image on the SDSS Web site may be downloaded, linked to, or
  otherwise used for any purpose, provided that you maintain the image
  credits." (the SDSS-IV policy page; the DR18 page was not found).
- **Attribution:** "Unless otherwise stated, images should be credited to the
  Sloan Digital Sky Survey."
- **Upstream:** `https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg`
- **Enters skymap:** `src/utils/math/sdssThumbnailUrl.ts` →
  `src/utils/network/fetchGalaxyBitmap.ts`, in the visitor's browser; nothing
  is stored by skymap.
- **Modified:** Drawn on a disc with a faded edge.
- **Checked:** 2026-10-07: <https://www.sdss4.org/collaboration/#image-use>

### Digitized Sky Survey cutouts (fetched while the app runs)

<!-- attribution: id=dss; hosts=alasky.cds.unistra.fr,aladin.cds.unistra.fr -->

- **What:** The fallback when SDSS has no image: a DSS2 colour cutout from the
  CDS `hips2fits` service. The cards also link to Aladin Lite.
- **By:** The Digitized Sky Surveys, produced at the Space Telescope Science
  Institute from Palomar and UK Schmidt plates; "Colored & Healpixed by CDS".
- **Licence:** Copyrighted. STScI: "Scientists and educators conducting
  research, teaching (including textbooks), or other non-profit activities may
  use data from the copyrighted collections freely and without restriction,
  other than that users are requested to acknowledge the source of the data in
  any publications resulting from that use. Commercial, for-profit use of the
  copyrighted collections is prohibited without written permission from the
  copyright holder(s)." The holders are Caltech, the Anglo-Australian
  Observatory Board, the UK SERC/PPARC (now STFC) and AURA, by plate. The CDS
  tile set names `hips_license = ODbL-1.0` and `obs_copyright = Digitized Sky
  Survey - STScI/NASA, Colored & Healpixed by CDS`.
- **Attribution:** "The Digitized Sky Surveys were produced at the Space
  Telescope Science Institute under U.S. Government grant NAG W-2166. The
  images of these surveys are based on photographic data obtained using the
  Oschin Schmidt Telescope on Palomar Mountain and the UK Schmidt Telescope."
  (the opening of the acknowledgement STScI asks for).
- **Upstream:** `https://alasky.cds.unistra.fr/hips-image-services/hips2fits`
- **Enters skymap:** `src/utils/math/dssThumbnailUrl.ts` →
  `src/utils/network/fetchGalaxyBitmap.ts`, in the visitor's browser.
- **Modified:** Drawn on a disc with a faded edge.
- **Checked:** 2026-10-07: <https://archive.stsci.edu/publishing/data-use>,
  <https://archive.stsci.edu/dss/copyright.html>,
  <https://archive.stsci.edu/dss/acknowledging.html>,
  <https://alasky.cds.unistra.fr/DSS/DSSColor/properties>

### StarNet2 (star removal)

<!-- attribution: id=starnet; keys=starnet.weights -->

- **What:** The program and trained weights (`StarNet2_weights.pt`) the curator
  runs to take the foreground stars out of each galaxy photograph. The
  `starless.webp` and atlas files shipped for the 78 curated galaxies are its
  output; the program and weights are not shipped.
- **By:** Nikita Misiura (StarNet).
- **Licence:** Not found for StarNet2 on starnetastro.com's front page. The
  author's earlier public repository (StarNet v1) states: "Code is available
  under MIT License" and "Weights are available under
  Attribution-NonCommercial-ShareAlike 4.0 International Creative Commons
  license … You can **NOT** use them for commercial purposes. You must give
  appropriate credit for usage of these weights." Whether that statement
  covers the StarNet2 weights used here is not established.
- **Attribution:** Credit StarNet (the v1 statement above).
- **Upstream:** <https://www.starnetastro.com/>
- **Enters skymap:** `tools/famous-curator/plugin/starnet.ts`, at curation time;
  weights downloaded by hand to `data/starnet/`.
- **Modified:** No.
- **Checked:** 2026-10-07: <https://www.starnetastro.com/>,
  <https://raw.githubusercontent.com/nekitmm/starnet/master/README.md>
- **Not verified:** the terms that come with the StarNet2 command-line download.

## Solar-system textures

Raw sources are gitignored; `tools/utils/io/textureSources.ts` and
`src/data/bodies/bodyTextureRegistry.ts` say which source feeds which body,
and `data/raw/textures/README.md` holds sizes and checksums. `npm run
build-textures` downsamples each into runtime tiers under
`public/data/images/textures/`, including the 13-tile boot atlas
`body-atlas.webp`. Titan has no texture: it is a sphere of one colour under its
atmosphere (`src/data/bodies/scenePlanets.ts`).

NASA's terms, referred to below as "NASA's media guidelines": "NASA content –
images, audio, video, and media files used in the rendition of 3-dimensional
models, such as texture maps and polygon data in any format – generally are not
subject to copyright in the United States. You may use this material for
educational or informational purposes … NASA should be acknowledged as the
source of the material." and "If the NASA material is to be used for commercial
purposes, including advertisements, it must not explicitly or implicitly convey
NASA’s endorsement of commercial goods or services." The same page says "The
NASA Insignia, Logotype, identifiers, and imagery are not in the public
domain." (<https://www.nasa.gov/nasa-brand-center/images-and-media/>, read
2026-10-07.)

### Solar System Scope: planet and Moon maps

<!-- attribution: id=solar-system-scope; keys=textures.sss* -->

- **What:** Surface maps of Mercury, Venus (cloud tops), Mars, Jupiter, Saturn,
  Uranus, Neptune and the Moon, and Saturn's ring strip.
- **By:** Solar System Scope (INOVE). The site says of them: "Textures in this
  pack are based on NASA elevation and imagery data", "Some parts of the
  planets remain to be mapped. These “gaps” are filled with fictional terrain
  that corresponds with the rest of the landscape. The colors are slightly more
  saturated".
- **Licence:** "Distributed under Attribution 4.0 International license: You
  may use, adapt, and share these textures for any purpose, even commercially."
- **Attribution:** The site gives no wording. Ours: "Textures by Solar System
  Scope (solarsystemscope.com), licensed under CC BY 4.0."
- **Upstream:** <https://www.solarsystemscope.com/textures/>
- **Enters skymap:** `npm run fetch-textures` → `data/raw/textures/*.jpg` →
  `npm run build-textures`.
- **Modified:** Yes. Downsampled; the Moon's is also lit by a normal map baked
  from LOLA heights.
- **Checked:** 2026-10-07: <https://www.solarsystemscope.com/textures/>

### USGS Astrogeology: Io, Europa, Ganymede and Callisto mosaics

<!-- attribution: id=usgs-galilean; keys=textures.usgsIo,textures.usgsEuropa,textures.usgsGanymede,textures.usgsCallisto -->

- **What:** Global mosaics from Voyager and Galileo SSI images.
- **By:** USGS Astrogeology Science Center (Europa: Tammy Becker and others),
  from NASA data.
- **Licence:** As each Astropedia record states. Io, Ganymede, Callisto:
  access constraints "public domain", use constraints "None". Europa: access
  constraints "None", use constraints "None". USGS in general: "USGS-authored
  or produced data and information are considered to be in the U.S. Public
  Domain."
- **Attribution:** None asked in the records. Ours: "NASA / USGS".
- **Upstream:** <https://planetarymaps.usgs.gov/mosaic/>
- **Enters skymap:** `npm run fetch-textures` → `build-textures`.
- **Modified:** Yes. Downsampled; Europa and Callisto are grey and tinted.
- **Checked:** 2026-10-07: <https://astrogeology.usgs.gov/search/map/io_galileo_ssi_voyager_color_merged_global_mosaic_1km>,
  <https://astrogeology.usgs.gov/search/map/europa_voyager_galileo_ssi_global_mosaic_500m>,
  <https://astrogeology.usgs.gov/search/map/ganymede_voyager_galileo_ssi_color_global_mosaic_1_4km>,
  <https://astrogeology.usgs.gov/search/map/callisto_galileo_voyager_global_mosaic_1km>,
  <https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits>

### USGS Astrogeology: Enceladus mosaic (Cassini)

<!-- attribution: id=usgs-enceladus; keys=textures.usgsEnceladus -->

- **What:** Global mosaic of Enceladus, 110 m per pixel.
- **By:** As the record lists; our credit is "NASA/JPL/Space Science
  Institute", publisher USGS Astrogeology.
- **Licence:** Access constraints "Public domain"; use constraints "Please
  cite authors".
- **Attribution:** Cite the authors named in the record.
- **Upstream:** <https://planetarymaps.usgs.gov/mosaic/Enceladus_Cassini_mosaic_global_110m.tif>
- **Enters skymap:** `npm run fetch-textures` → `build-textures`.
- **Modified:** Yes. Downsampled, tinted and brightened.
- **Checked:** 2026-10-07: <https://astrogeology.usgs.gov/search/map/enceladus_cassini_global_mosaic_110m>

### NASA Photojournal: colour maps of Mimas, Tethys, Dione, Rhea and Iapetus

<!-- attribution: id=photojournal-saturn-moons; keys=textures.nasaMimas,textures.nasaTethys,textures.nasaDione,textures.nasaRhea,textures.nasaIapetus -->

- **What:** Cassini global maps PIA18437, PIA18439, PIA18434, PIA18438, PIA18436.
- **By:** "Image selection, radiometric calibration, geographic registration
  and photometric correction, as well as mosaic selection and assembly were
  performed by Paul Schenk at the Lunar and Planetary Institute."
- **Licence:** NASA's media guidelines, quoted above.
- **Attribution:** "Credits: NASA/JPL-Caltech/Space Science Institute/Lunar and
  Planetary Institute".
- **Upstream:** <https://science.nasa.gov/photojournal/color-maps-of-mimas-2014/>
  and its four siblings.
- **Enters skymap:** `npm run fetch-textures` → `build-textures`.
- **Modified:** Yes. Brightness only is kept and tinted; each map is turned
  half a turn to put longitude 0 at the centre.
- **Checked:** 2026-10-07: <https://science.nasa.gov/photojournal/color-maps-of-mimas-2014/>,
  <https://www.nasa.gov/nasa-brand-center/images-and-media/>
- **Not verified:** the pages of the other four maps.

### Gaskell shape models of Mimas, Tethys and Dione

<!-- attribution: id=gaskell; keys=textures.gaskell* -->

- **What:** Shape models used to bake each moon's normal map; build input
  only, no pixels of them are shipped.
- **By:** Robert Gaskell; archived by the NASA PDS Small Bodies Node.
- **Licence:** Not stated in the bundle's readme.
- **Attribution:** The readme's reference: Gaskell et al. 2008, "Characterizing
  and navigating small bodies with imaging data", Meteoritics and Planetary
  Science 43, 1049.
- **Upstream:** <https://sbnarchive.psi.edu/pds4/non_mission/gaskell.mimas.shape-model/>
  (and `gaskell.tethys.shape-model`, `gaskell.dione.shape-model`).
- **Enters skymap:** `npm run fetch-textures` → `tools/textures/bakeNormalMap.ts`.
- **Modified:** Yes. Turned into a normal map.
- **Checked:** 2026-10-07: <https://sbnarchive.psi.edu/pds4/non_mission/gaskell.mimas.shape-model/readme.txt>
- **Not verified:** the Tethys and Dione readmes.

### Enceladus global DEM (Schenk & McKinnon 2024)

<!-- attribution: id=schenk-enceladus-dem; keys=textures.schenkEnceladusDem -->

- **What:** Heights used to bake Enceladus's normal map; build input only.
- **By:** Paul M. Schenk and William B. McKinnon (Lunar and Planetary
  Institute/USRA); published by the Planetary Data System, 2024-08-12.
- **Licence:** Access constraints "None"; use constraints "Please cite authors".
- **Attribution:** Schenk & McKinnon 2024, Icarus 408,
  doi:10.1016/j.icarus.2023.115827.
- **Upstream:** <https://astrogeology.usgs.gov/search/map/enceladus-cassini-global-dem-200m-schenk>
- **Enters skymap:** `npm run fetch-textures` → `bakeNormalMap.ts`.
- **Modified:** Yes. Turned into a normal map.
- **Checked:** 2026-10-07: <https://astrogeology.usgs.gov/search/map/enceladus-cassini-global-dem-200m-schenk>

### Uranian satellite mosaics and DEMs (Schenk 2020)

<!-- attribution: id=schenk-uranian; keys=textures.schenkMirandaMosaic,textures.schenkArielMosaic,textures.schenkUmbrielMosaic,textures.schenkTitaniaMosaic,textures.schenkOberonMosaic,textures.schenkMirandaDem,textures.schenkArielDem -->

- **What:** Voyager 2 mosaics of Miranda, Ariel, Umbriel, Titania and Oberon,
  shipped as greyscale textures, and the Miranda and Ariel height maps, used
  to bake normal maps.
- **By:** Paul Schenk, "Uranian Satellite Global Mosaics and Digital Elevation
  Models", 2020, USRA Houston Repository, hdl:20.500.11753/1687.
- **Licence:** None stated, as recorded when the files were downloaded
  (`data/raw/textures/README.md`): the repository's readme asks users to cite
  and to contact the author.
- **Attribution:** Cite the repository record and Schenk & Moore 2020, Phil.
  Trans. R. Soc. A 378, 20200102.
- **Upstream:** <https://repository.hou.usra.edu/handle/20.500.11753/1687>
- **Enters skymap:** downloaded by hand in a browser → `build-textures`.
- **Modified:** Yes. Scaled to each moon's albedo, unseen areas filled with
  flat grey, downsampled.
- **Checked:** 2026-10-07: the repository refused the request (HTTP 403, a
  browser check), so nothing was re-read.
- **Not verified:** the readme's wording today.

### USGS Astrogeology: Pluto and Charon mosaics (New Horizons)

<!-- attribution: id=usgs-pluto-charon; keys=textures.usgsPluto,textures.usgsCharon -->

- **What:** Global mosaics of Pluto and Charon, 300 m per pixel.
- **By:** "New Horizons Team"; originators "NASA, Johns Hopkins University
  Applied Physics Laboratory, Southwest Research Institute, Lunar and Planetary
  Institute"; publisher USGS Astrogeology Science Center.
- **Licence:** Access constraints "None"; use constraints "Please cite
  authors". The records do not use the words "public domain".
- **Attribution:** Cite the authors as above.
- **Upstream:** <https://planetarymaps.usgs.gov/mosaic/>
- **Enters skymap:** `npm run fetch-textures` → `build-textures`.
- **Modified:** Yes. Charon is tinted; Pluto's mosaic gives the brightness of a
  texture whose colour comes from the next entry.
- **Checked:** 2026-10-07: <https://astrogeology.usgs.gov/search/map/pluto_new_horizons_lorri_mvic_global_mosaic_300m>,
  <https://astrogeology.usgs.gov/search/map/charon_new_horizons_lorri_mvic_global_mosaic_300m>

### NASA: Pluto colour map and "True Colors of Pluto"

<!-- attribution: id=nasa-pluto-colour; keys=textures.nasaPlutoColor,textures.nasaPlutoTrueColorRef -->

- **What:** PIA11707, a global colour map "based on a series of three color
  filter images obtained by the Ralph/Multispectral Visual Imaging Camera",
  used only as a colour source; and the natural-colour view of which NASA says
  "The processing creates images that would approximate the colors that the
  human eye would perceive", used only to calibrate that colour.
- **By:** NASA/Johns Hopkins University Applied Physics Laboratory/Southwest
  Research Institute; the true-colour view adds Alex Parker.
- **Licence:** NASA's media guidelines, quoted above.
- **Attribution:** "NASA/Johns Hopkins University Applied Physics
  Laboratory/Southwest Research Institute" and, for the true-colour view,
  "…/Alex Parker".
- **Upstream:** <https://science.nasa.gov/photojournal/pluto-color-map/>,
  <https://science.nasa.gov/resource/true-colors-of-pluto/>
- **Enters skymap:** `npm run fetch-textures` → `tools/textures/fitPlutoChroma.ts`.
- **Modified:** Yes. PIA11707's colour is un-stretched by a fit against the
  true-colour view before any of it reaches a texture; neither file is shipped
  as it is. That PIA11707 is enhanced colour is our inference, set out in
  `rawDataRegistry.ts`.
- **Checked:** 2026-10-07: <https://science.nasa.gov/photojournal/pluto-color-map/>,
  <https://science.nasa.gov/resource/true-colors-of-pluto/>

### USGS Astrogeology: Triton colour mosaic (Voyager 2)

<!-- attribution: id=usgs-triton; keys=textures.usgsTriton -->

- **What:** Global colour mosaic of Triton, 600 m per pixel (PIA18668).
- **By:** Primary authors "Lunar and Planetary Institute"; originators "NASA,
  Jet Propulsion Laboratory, Dr. Paul Schenk"; publisher USGS Astrogeology.
- **Licence:** Access constraints "public domain"; use constraints "Please cite
  authors".
- **Attribution:** Cite the authors as above.
- **Upstream:** <https://planetarymaps.usgs.gov/mosaic/Triton_Voyager2_ClrMosaic_GlobalFill_600m.tif>
- **Enters skymap:** `npm run fetch-textures` → `build-textures`.
- **Modified:** Yes. The unlit northern part is painted with the mean colour.
- **Checked:** 2026-10-07: <https://astrogeology.usgs.gov/search/map/triton_voyager_2_global_color_mosaic_600m>

### Triton topographic map (Schenk et al. 2021)

<!-- attribution: id=schenk-triton-dem; keys=textures.schenkTritonDem -->

- **What:** A regional height map of Triton, used to bake its normal map;
  build input only.
- **By:** Paul Schenk and others; USRA Houston Repository.
- **Licence:** None stated, as recorded when the file was downloaded.
- **Attribution:** Schenk et al. 2021, "Triton: Topography and Geology of a
  Probable Ocean World with Comparison to Pluto and Charon", Remote Sensing
  13, 3476.
- **Upstream:** <https://repository.hou.usra.edu/items/97fc385d-8a66-4120-b3b7-f35562877a94>
- **Enters skymap:** downloaded by hand → `bakeNormalMap.ts`.
- **Modified:** Yes. Turned into a normal map.
- **Checked:** 2026-10-07: the repository refused the request (HTTP 403).
- **Not verified:** the record's wording today.

### NASA SVS: CGI Moon Kit (LOLA elevation)

<!-- attribution: id=svs-moon-kit; keys=textures.moonElevation -->

- **What:** Lunar heights from the LOLA altimeter, used to bake the Moon's
  normal map; build input only.
- **By:** NASA's Scientific Visualization Studio; visualiser Ernie Wright
  (USRA), scientist Noah Petro (NASA/GSFC).
- **Licence:** NASA's media guidelines, quoted above.
- **Attribution:** "Please give credit for this item to: NASA's Scientific
  Visualization Studio".
- **Upstream:** <https://svs.gsfc.nasa.gov/4720>
- **Enters skymap:** `npm run fetch-textures` → `bakeNormalMap.ts`.
- **Modified:** Yes. Turned into a normal map.
- **Checked:** 2026-10-07: <https://svs.gsfc.nasa.gov/4720>

## Earth imagery and terrain

The surface tile manifests under `public/data/images/earth-tiles/` and
`mars-tiles/` carry an attribution string per source, written by the bake
(`tools/textures/*Source.ts`, `surfaceBodies/*.ts`).

### NASA Blue Marble and Black Marble

<!-- attribution: id=nasa-blue-marble; keys=textures.nasaBmng*,textures.earthWaterMask,textures.earthNight,textures.earthElevation,textures.earthClouds; hosts=visibleearth.nasa.gov -->

- **What:** Earth's surface (Blue Marble Next Generation, August 2004,
  topography and bathymetry: one whole-globe image and eight quadrants), night
  lights (Black Marble 2016), the land/water mask, the cloud composite, and a
  GEBCO_08-derived relief image used only to bake the normal map.
- **By:** NASA Earth Observatory; NASA Goddard Space Flight Center (clouds:
  Reto Stöckli); relief: "Imagery by Jesse Allen, NASA's Earth Observatory,
  using data from the General Bathymetric Chart of the Oceans (GEBCO) produced
  by the British Oceanographic Data Centre."
- **Licence:** NASA's media guidelines, quoted above.
- **Attribution:** "NASA should be acknowledged as the source of the
  material." Ours: "NASA Earth Observatory", and for night lights "NASA Earth
  Observatory / NASA's Goddard Space Flight Center, Suomi NPP VIIRS".
- **Upstream:** <https://visibleearth.nasa.gov/>; file URLs in the registry.
  The water mask is fetched from the Internet Archive's copy of NASA's retired
  NEO archive.
- **Enters skymap:** `npm run fetch-textures` → `build-textures` (base globe,
  night, clouds, material and normal maps) and `build-surface-tiles` (tile
  levels 3 to 7).
- **Modified:** Yes. Downsampled and tiled; cloud opacity derived from
  brightness; the relief turned into a normal map.
- **Checked:** 2026-10-07: <https://www.nasa.gov/nasa-brand-center/images-and-media/>,
  <https://visibleearth.nasa.gov/images/73934/topography>
- **Not verified:** the credit lines on the pages of the Blue Marble month,
  Black Marble, the water mask and the cloud composite (the pages need a
  script to show them).

### EOxCloudless (Sentinel-2), layer s2cloudless-2025

<!-- attribution: id=eox; keys=eox.*; hosts=cloudless.eox.at -->

- **What:** Cloud-free satellite imagery of chosen regions
  (`tools/fetch/eoxRegions.ts`), tile levels 8 to 13.
- **By:** EOX IT Services GmbH, from Copernicus Sentinel-2 data.
- **Licence:** "For the years 2018 to 2025, EOxCloudless WM(T)S layers is
  licensed under the Creative Commons Attribution-NonCommercial-ShareAlike 4.0
  International License." (The 2016 layer alone is CC BY 4.0.) Commercial use
  needs EOX's commercial licence. skymap uses the 2025 layer with written
  permission from EOX IT Services GmbH, given to the maintainer by email in
  September 2026; the email is not in the repository.
- **Attribution:** Required, verbatim: "EOxCloudless https://cloudless.eox.at
  by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2025)".
  "The attribution shall be displayed legibly and in proximity to the usage".
- **Upstream:** <https://cloudless.eox.at>; tiles from `tiles.maps.eox.at`.
- **Enters skymap:** `npm run fetch-eox` → `data/raw/eox/` →
  `build-surface-tiles` → `earth-tiles/…/albedo/`.
- **Modified:** Yes. Re-tiled, colour-matched to Blue Marble, filled from Blue
  Marble at region edges.
- **Checked:** 2026-10-07: <https://cloudless.eox.at/license-non-commercial>,
  <https://cloudless.eox.at/documentation/license>

### GeoDanmark orthophoto (Søndermarken, Copenhagen)

<!-- attribution: id=geodanmark; keys=geodanmark.* -->

- **What:** Aerial photography at 10 cm per pixel, layer
  `geodanmark_2025_10cm` (spring 2025), tile levels 14 to 19 over one park.
- **By:** GeoDanmark and Klimadatastyrelsen, served by Datafordeleren.
- **Licence:** CC BY 4.0. "CC BY 4.0 licensen gælder for anvendelse af data fra
  GeoDanmark. Du skal kreditere GeoDanmark på et passende sted."
- **Attribution:** GeoDanmark's page: "Du krediterer GeoDanmark ved at skrive
  “@geodanmark”, hvor du skal linke til denne side." The string baked into the
  tile manifest is "Ortofoto © GeoDanmark / Klimadatastyrelsen (CC BY 4.0)".
- **Upstream:** `https://wms.datafordeler.dk/GeoDanmarkOrto/orto_foraar/1.0.0/WMS`
- **Enters skymap:** harvested by hand (`data/raw/geodanmark/README.md`) →
  `build-surface-tiles`.
- **Modified:** Yes. Re-tiled on skymap's grid and averaged down to level 14.
- **Checked:** 2026-10-07: <https://www.geodanmark.dk/home/vejledninger/vilkaar-for-data-anvendelse/>,
  <https://www.klimadatastyrelsen.dk/om-klimadatastyrelsen/vilkaar-og-priser>,
  <https://datafordeler.dk/vejledning/brugervilkaar/>

### ETOPO 2022 (global heights)

<!-- attribution: id=etopo; keys=etopo.* -->

- **What:** The 30 arc-second surface elevation grid; the global height band.
- **By:** NOAA National Centers for Environmental Information.
- **Licence:** Not stated on the product page.
- **Attribution:** "NOAA National Centers for Environmental Information. 2022:
  ETOPO 2022 15 Arc-Second Global Relief Model. NOAA National Centers for
  Environmental Information. DOI: 10.25921/fd45-gt74. Accessed [date]."
- **Upstream:** <https://www.ncei.noaa.gov/products/etopo-global-relief-model>
- **Enters skymap:** `npm run fetch-height` → `data/raw/etopo/` →
  `build-surface-tiles` → `earth-tiles/…/height/`.
- **Modified:** Yes. Re-gridded, quantised to 0.1 m; water flattened to its
  shore level.
- **Checked:** 2026-10-07: <https://www.ncei.noaa.gov/products/etopo-global-relief-model>

### Terrain Tiles "skadi" (1 arc-second heights)

<!-- attribution: id=skadi; keys=skadi.* -->

- **What:** Heights under the EOX regions, from the `elevation-tiles-prod`
  bucket of the AWS Open Data registry.
- **By:** Mapzen (a Linux Foundation project), compiled from national and
  global sources.
- **Licence:** The registry's licence field points at Mapzen's attribution
  page, which says: "Attribution is required for many terrain tile data
  providers. Example language is provided below, but you are responsible for
  researching each project to follow their license terms."
- **Attribution:** The page's required list names, among others: "Europe
  terrain data produced using Copernicus data and information funded by the
  European Union - EU-DEM layers" and "United States 3DEP (formerly NED) and
  global GMTED2010 and SRTM terrain data courtesy of the U.S. Geological
  Survey." Which providers lie under each of our regions has not been worked
  out. Citation asked by the registry: "Terrain Tiles was accessed on DATE
  from https://registry.opendata.aws/terrain-tiles."
- **Upstream:** <https://elevation-tiles-prod.s3.amazonaws.com/skadi/>
- **Enters skymap:** `npm run fetch-height -- --skadi` → `data/raw/skadi/` →
  `build-surface-tiles`.
- **Modified:** Yes. Re-gridded and quantised.
- **Checked:** 2026-10-07: <https://registry.opendata.aws/terrain-tiles/>,
  <https://raw.githubusercontent.com/tilezen/joerd/master/docs/attribution.md>

### Danmarks Højdemodel: DHM/Terræn and DHM Punktsky

<!-- attribution: id=dhm; keys=dhmterraen.*,dhm.* -->

- **What:** The 0.4 m terrain grid under the Søndermarken orthophoto (shipped
  as height tiles), and the LiDAR point cloud of the same area (an input of
  the scene-reconstruction tools; not shipped by the app).
- **By:** Klimadatastyrelsen, served by Datafordeleren.
- **Licence:** CC BY 4.0. "Klimadatastyrelsen stiller geografiske data gratis
  til rådighed. Anvendelsen af frie geografiske data reguleres af CC BY 4.0
  licensen." It applies to data fetched from 16 May 2024.
- **Attribution:** "Du skal kreditere Klimadatastyrelsen på et passende sted."
  Ours: "© Klimadatastyrelsen, distributed via Datafordeler as free public
  data." (terrain), "Danmarks Højdemodel (Punktsky) © Klimadatastyrelsen (CC BY
  4.0)" (point cloud).
- **Upstream:** `https://api.datafordeler.dk/FileDownloads/`
- **Enters skymap:** `npm run fetch-height -- --dhm-terraen` →
  `build-surface-tiles`; `tools/fetch/fetchDhm.ts` → `tools/scene-recon/bakeLidar.ts`.
- **Modified:** Yes. Reprojected from UTM, re-gridded, quantised.
- **Checked:** 2026-10-07: <https://www.klimadatastyrelsen.dk/om-klimadatastyrelsen/vilkaar-og-priser>,
  <https://datafordeler.dk/vejledning/brugervilkaar/>

### Skråfoto and the Søndermarken scan (scene reconstruction)

<!-- attribution: id=skraafoto; keys=skraafoto.*,meshes.soendermarken*; hosts=dataforsyningen.dk -->

- **What:** Oblique aerial photographs (flight `skraafotos2019`) from which
  `tools/scene-recon/` and `tools/scene-workbench/` reconstructed a textured
  mesh of Søndermarken. The crop of that mesh is the one scene-recon output
  the app ships (`public/data/meshes/soendermarken*`); splats and point clouds
  stay in the workbench.
- **By:** Photographs: Klimadatastyrelsen (Dataforsyningen). Reconstruction:
  Alexander Rulkens, with COLMAP, OpenMVS, Brush and PDAL run as external
  programs (none of their code is shipped).
- **Licence:** Photographs: CC BY 4.0, as in the entry above. The tools, as
  GitHub reports them today: OpenMVS AGPL-3.0, Brush Apache-2.0; COLMAP and
  PDAL carry licences GitHub does not classify, not read here.
- **Attribution:** "Du skal kreditere Klimadatastyrelsen på et passende sted."
  The string on the shipped mesh: "Contains skråfoto © Klimadatastyrelsen (CC
  BY 4.0); photogrammetry by Alexander Rulkens".
- **Upstream:** <https://dataforsyningen.dk/> (STAC API
  `api.dataforsyningen.dk/rest/skraafoto_api/v1.0`).
- **Enters skymap:** `tools/fetch/fetchSkraafoto.ts` → `data/raw/skraafoto/` →
  `tools/scene-recon/bakeMesh.ts`, `cropMesh.ts` →
  `data/raw/meshes/soendermarken/mesh.glb` → `npm run build-meshes`.
- **Modified:** Yes. A derived 3D model, cropped to the park.
- **Checked:** 2026-10-07: <https://www.klimadatastyrelsen.dk/om-klimadatastyrelsen/vilkaar-og-priser>,
  <https://api.github.com/repos/cdcseacave/openMVS>,
  <https://api.github.com/repos/ArthurBrussee/brush>,
  <https://api.github.com/repos/colmap/colmap>, <https://api.github.com/repos/PDAL/PDAL>
- **Not verified:** the STAC collection's licence link (the Dataforsyningen
  page needs a script); the COLMAP and PDAL licence texts.

## Mars surface

Baked by `npm run build-surface-tiles -- --body mars` into `mars-tiles/`. The
close-up imagery at the four rover sites is HiRISE data. HiRISE's own image
policy page was not found today (`uahirise.org/policy/` answered 404); the
bake credits "HiRISE: NASA/JPL/University of Arizona".

### MOLA global heights

<!-- attribution: id=mola; keys=mola.* -->

- **What:** Mars MGS MOLA DEM, 463 m.
- **By:** "MOLA Team"; originators "Goddard Space Flight Center"; publisher
  USGS Astrogeology Science Center.
- **Licence:** Access constraints "CC0 (public domain)"; use constraints "None".
- **Attribution:** None asked. Ours: "MOLA 463 m DEM: NASA/GSFC MGS MOLA team,
  USGS Astrogeology (public domain)."
- **Upstream:** <https://planetarymaps.usgs.gov/mosaic/Mars_MGS_MOLA_DEM_mosaic_global_463m.tif>
- **Enters skymap:** fetched by hand (`data/raw/mola/README.md`) →
  `tools/textures/surfaceBodies/marsSurfaceBake.ts`.
- **Modified:** Yes. Converted to Float32, re-gridded, raised 6,190 m to the
  scene's datum.
- **Checked:** 2026-10-07: <https://astrogeology.usgs.gov/search/map/mars_mgs_mola_dem_463m>

### Viking colour mosaic (MDIM 2.1)

<!-- attribution: id=viking; keys=viking.* -->

- **What:** Mars Viking Colorized Global Mosaic, 232 m.
- **By:** USGS Astrogeology Science Center; originators "NASA AMES".
- **Licence:** Access constraints "Public domain"; use constraints "None".
- **Attribution:** None asked. Ours: "Viking MDIM 2.1 colour mosaic:
  NASA/JPL/USGS Astrogeology (public domain)."
- **Upstream:** <https://planetarymaps.usgs.gov/mosaic/Mars_Viking_MDIM21_ClrMosaic_global_232m.tif>
- **Enters skymap:** fetched by hand (`data/raw/viking/README.md`) →
  `marsSurfaceBake.ts`.
- **Modified:** Yes. Re-tiled; it also sets the colour of the grey orthophotos.
- **Checked:** 2026-10-07: <https://astrogeology.usgs.gov/search/map/mars_viking_colorized_global_mosaic_232m>

### Gale crater: MSL DEM and colour orthophoto (Curiosity's site)

<!-- attribution: id=hirise-gale; keys=hirise.gale.* -->

- **What:** The MSL Gale merged DEM, 1 m, and a HiRISE colour basemap of 78
  quadrangles, 0.25 m.
- **By:** DEM: "Timothy Parker and Fred J. Calef III"; originators
  "JPL-Caltech, NASA, USGS Astrogeology Science Center, University of
  Arizona". The record read for the orthophoto is the 25 cm merged mosaic by
  the same two authors; the colour file skymap bakes
  (`MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif`) has no record that was found.
- **Licence:** Access constraints "Please credit authors"; use constraints
  "None" (both records).
- **Attribution:** Credit the authors. The string in the tile manifest is
  "HiRISE: NASA/JPL/University of Arizona; MSL Gale DEM and 78-quad colour
  mosaic, USGS Astrogeology / JPL (public domain)."; it names neither author,
  and "public domain" is not a phrase of either record.
- **Upstream:** <https://planetarymaps.usgs.gov/mosaic/Mars/MSL/>
- **Enters skymap:** fetched by hand (`data/raw/hirise/gale/README.md`) →
  `marsSurfaceBake.ts`.
- **Modified:** Yes. Re-tiled and raised to the scene's datum.
- **Checked:** 2026-10-07: <https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m>,
  <https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm>
- **Not verified:** a catalogue record for the 78-quadrangle colour file.

### Jezero crater: MSR HiRISE DTM and orthomosaic (Perseverance's site)

<!-- attribution: id=hirise-jezero; keys=hirise.jezero.* -->

- **What:** USGS terrain and orthoimage mosaics of Jezero, 1 m and 0.25 m.
- **By:** Bland, Galuszka, Hare, Mayer, Redding & Wheeler 2024, USGS.
- **Licence:** Access constraints "None"; use constraints "Please cite authors".
- **Attribution:** "Bland, M. T., Galuszka, D. M., Hare, T. M., Mayer, D. P.,
  Redding, B. L., Wheeler, B. H., 2024, Mars Sample Return Terrain Relative
  Navigation HiRISE DTM and Orthoimage Mosaics, USGS Data Release,
  https://doi.org/10.5066/P13CPYYU"
- **Upstream:** <https://doi.org/10.5066/P13CPYYU>
- **Enters skymap:** fetched by hand (`data/raw/hirise/jezero/README.md`) →
  `marsSurfaceBake.ts`.
- **Modified:** Yes. Re-tiled, raised to the scene's datum.
- **Checked:** 2026-10-07: <https://astrogeology.usgs.gov/search/map/mars-sample-return-terrain-relative-navigation-hirise-dtm-mosaic>

### Columbia Hills and Endeavour crater: HiRISE DTMs and orthophotos (Spirit's and Opportunity's sites)

<!-- attribution: id=hirise-dtm; keys=hirise.gusev.*,hirise.endeavour.* -->

- **What:** Controlled HiRISE stereo terrain models
  `DTEEC_001513_1655_001777_1650` and `DTEEC_018701_1775_018846_1775`, 1 m,
  with their RED orthophotos, 0.25 m.
- **By:** HiRISE (NASA/JPL/University of Arizona); the controlled products are
  published by USGS Astrogeology as analysis-ready data.
- **Licence:** Recorded as CC0-1.0 from the products' STAC records when they
  were fetched (`data/raw/hirise/*/README.md`).
- **Attribution:** None required by CC0. Ours: "HiRISE: NASA/JPL/University of
  Arizona; DTEEC_…, USGS Astrogeology (CC0)."
- **Upstream:** `https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/`
- **Enters skymap:** fetched by hand → `marsSurfaceBake.ts`.
- **Modified:** Yes. Re-tiled; the grey orthophotos are coloured from Viking.
- **Checked:** 2026-10-07: no record could be opened (the STAC collection
  addresses tried answered 404).
- **Not verified:** the CC0 statement today.

## 3D models

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
