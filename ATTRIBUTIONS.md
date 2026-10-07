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
- **Use** is the Licence bullet in one of twelve fixed terms, for a reader who
  must know at a glance what may be done with a thing. It takes the most
  restrictive term the licence text supports; two terms joined by `;` both
  apply. The Licence bullet is the authority, the term only an index to it.
  - `Free, no credit asked`: any use, commercial included; the holder asks for
    nothing (public domain or CC0 in the holder's own words).
  - `Free with credit`: any use, commercial included, if the holder is
    credited, cited or its licence notice kept (CC BY, MIT, BSD, or a holder
    whose one stated condition is to be cited).
  - `Share-alike`: as `Free with credit`, and a changed copy may be passed on
    only under the same licence (CC BY-SA, the SIL Open Font License).
  - `Copyleft code`: a program under the GPL, the AGPL or CeCILL; a copy, or a
    work based on it, must carry the same licence. The entry says whether
    skymap ships the program or only runs it.
  - `Conditions apply`: the holder allows use with credit and sets conditions
    on some uses, or speaks for one country only; the entry quotes them
    (NASA's media guidelines).
  - `Non-commercial only`: the licence excludes commercial use (CC BY-NC);
    such use needs the holder's permission.
  - `No derivatives`: the licence does not allow changed copies to be passed
    on (CC BY-ND).
  - `Ask the holder`: copyrighted with rights reserved, or commercial use
    forbidden without written permission.
  - `No licence stated`: the holder publishes no licence. Nothing beyond what
    the holder's own page says may be assumed; ask before any other use.
  - `Per item`: the entry covers several things under different terms, some
    of them restricted; read the entry, item by item.
  - `Reference only`: a method followed, a service called, a page linked or a
    few published numbers used. Nothing of the holder's is shipped as a file;
    the source is cited where the entry names one.
  - `Ours (MIT)`: written by the project, under the repository's licence.
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
fails when a `###` heading here is not a complete entry, when a **Use** term
is missing or not one of the twelve, when an entry whose Licence text speaks
of non-commercial use or of permission carries only free terms, when a
registry key
(or the host it is fetched from) does not belong to exactly one entry, or when
a host named anywhere in `src/`, `index.html` or `.env.production`, comments
included, has no entry. Adding a source, or porting code and naming where it
came from, therefore means adding its entry, with the page you read and the
date. The gate cannot tell whether a licence line is true; that is the
reader's check.

The entries state terms; they are not legal advice.

## Catalogue data

Several catalogues below reach skymap through CDS (VizieR or its FTP mirror).
What CDS displays about reuse on its page "Rules of usage of VizieR data" is
referred to as "the CDS terms" in the entries: "The data retrieved with VizieR
are free of usage in a scientific context; however, as it is the usage in
scientific publication, the original authors and publication references
including the publisher have to be explicitely cited", "The commercial usage
of the data is subject to rules depending of the origin" and "The copyrights
of a catalogue depend on the data origin." For those rules the page sends the
reader to a copyright statement in the catalogue's ReadMe and, where there is
none, to "the policy section of the journals", with links to the policies of
the AAS journals, A&A and MNRAS. It displays no licence of its own for any of
them. (<https://cds.unistra.fr/vizier-org/licences_vizier.html>, read
2026-10-07 as a browser shows it and as HTML source.) CDS's general terms
add: "All Users must comply with the User licence specific to each Dataset"
and "Datasets subject to a specific licence from the data Contributor are
distributed in accordance with the licence rights. This specific licence is
provided on the Dataset page." (<https://cds.unistra.fr/legals/>, read
2026-10-07.) The VizieR page of each of the eight catalogues used here shows
no licence line, and none of their ReadMe files has a copyright or licence
section. Not displayed by CDS: the source of the rules page also holds, inside
HTML comments that a browser does not show, the sentences "Tabular data,
spectra or images coming from AAS journals (J/ApJ, J/ApJS, J/AJ) are under
CC-BY-NC licence (http://creativecommons.org/licenses/by-nc-nd/)" and "Tabular
data, spectra or images coming from A&A (J/A+A) are free for a scientific
usage". CDS has commented both out, so whether they still state its position
is unclear, and no entry here reads them as a licence.

### SDSS, the Sloan Digital Sky Survey (DR17 spectra and photometry)

<!-- attribution: id=sdss; keys=sdss.*; hosts=www.sdss.org,www.sdss4.org -->

- **What:** Sky positions, spectroscopic redshifts, `ugriz` magnitudes and
  shapes of galaxies: our own query of `SpecObj` joined to `PhotoObjAll`.
- **By:** The SDSS collaboration (SDSS-IV for DR17).
- **Licence:** "All SDSS data released in our public data releases is
  considered in the public domain."
- **Use:** Free with credit
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
- **Licence:** Not stated. The authors state none: the survey's own page and
  the VizieR ReadMe (J/ApJS/199/26) carry no licence or copyright section, and
  the catalogue's VizieR page shows no licence line. skymap uses the copy CDS
  serves, and the CDS terms apply to it: "The data retrieved with VizieR are
  free of usage in a scientific context", and "The commercial usage of the
  data is subject to rules depending of the origin". For a table from an AAS
  journal CDS points to the journal's policy, which says: "The AAS holds the
  copyright for all non-gold-OA articles published in the Astronomical
  Journal, the Astrophysical Journal, Astrophysical Journal Letters, and the
  Astrophysical Journal Supplement Series prior to 11 Oct 2021", "the Society
  grants control of the right to reproduce the material to the original
  authors as long as they are alive" and "Permission to reproduce material
  from articles for which the AAS holds the copyright is managed on behalf of
  the AAS by IOP Publishing." An older sentence about tables from AAS
  journals is commented out of CDS's page and not displayed; it is quoted
  with the CDS terms and is not read as a licence here.
- **Use:** No licence stated
- **Attribution:** Cite Huchra et al. 2012. 2MASS, on which the survey rests,
  asks for: "This publication makes use of data products from the Two Micron
  All Sky Survey, which is a joint project of the University of Massachusetts
  and the Infrared Processing and Analysis Center/California Institute of
  Technology, funded by the National Aeronautics and Space Administration and
  the National Science Foundation."
- **Upstream:** <http://tdc-www.harvard.edu/2mrs/>;
  <https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/ApJS/199/26>. (The
  app's Splash links the name 2MRS to NASA LAMBDA's page on 2MASS, which is
  why that host is listed here; it is not the survey's page.)
- **Enters skymap:** `data/raw/2mrs/2mrs_table3.dat` → `tools/parsers/twoMrs.ts`.
- **Modified:** Yes. Cross-matched, given distances and re-encoded.
- **Checked:** 2026-10-07: <http://tdc-www.harvard.edu/2mrs/>,
  <https://www.ipac.caltech.edu/2mass/releases/allsky/faq.html>,
  <https://cds.unistra.fr/vizier-org/licences_vizier.html>,
  <https://cds.unistra.fr/legals/>,
  <https://vizier.cds.unistra.fr/viz-bin/cat/J/ApJS/199/26>,
  <https://cdsarc.cds.unistra.fr/ftp/J/ApJS/199/26/ReadMe>,
  <https://journals.aas.org/article-charges-and-copyright/> (where CDS's
  link for AAS journals leads)

### 2MASS Extended Source Catalog (XSC)

<!-- attribution: id=2mass-xsc; keys=2mrs.xsc-pa -->

- **What:** Position angle and axis ratio (`sup_phi`, `sup_ba`) of 2MRS
  galaxies, from VizieR `VII/233/xsc`.
- **By:** Jarrett et al. 2000, AJ 119, 2498; the 2MASS project (University of
  Massachusetts and IPAC/Caltech).
- **Licence:** Not stated for the catalogue. The 2MASS pages read state no
  licence for it, and the ReadMe of the copy CDS serves (VII/233) has no
  copyright or licence section. The survey's own archive, IRSA, says: "Most
  data served by IRSA is public, with no usage restrictions." (it does not
  name 2MASS in that sentence). skymap uses the CDS copy, and the CDS terms
  apply to it: "The data retrieved with VizieR are free of usage in a
  scientific context", and "The commercial usage of the data is subject to
  rules depending of the origin"; for those rules CDS points to the
  catalogue's ReadMe, which states none.
- **Use:** No licence stated
- **Attribution:** Cite Jarrett et al. 2000. The ReadMe asks for "the
  following standard acknowledgement in any published material that makes
  use of the 2MASS data products": "This publication makes use of data
  products from the Two Micron All Sky Survey, which is a joint project of
  the University of Massachusetts and the Infrared Processing and Analysis
  Center/California Institute of Technology, funded by the National
  Aeronautics and Space Administration and the National Science
  Foundation." 2MASS's own page names as "The primary journal reference for
  2MASS and its image and catalog data products" Skrutskie et al. 2006, AJ
  131, 1163. CDS adds, for the service: "If the access to catalogues with
  VizieR was helpful for your research work, the following acknowledgment
  would be appreciated" (see entry: vizier).
- **Upstream:** <https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/233>
- **Enters skymap:** `tools/fetch/fetch2massXsc.ts` → `data/raw/2mrs/2mass_xsc_pa.csv`.
- **Modified:** Yes. Two columns kept, joined to 2MRS by 2MASS id.
- **Checked:** 2026-10-07: <https://www.ipac.caltech.edu/2mass/releases/allsky/faq.html>,
  <https://irsa.ipac.caltech.edu/data_use_terms.html>,
  <https://cds.unistra.fr/vizier-org/licences_vizier.html>,
  <https://cdsarc.cds.unistra.fr/ftp/VII/233/ReadMe>,
  <https://vizier.cds.unistra.fr/viz-bin/cat/VII/233>

### GLADE v2.3, the Galaxy List for the Advanced Detector Era

<!-- attribution: id=glade; keys=glade.*; hosts=glade.elte.hu -->

- **What:** An all-sky compilation of galaxies with spectroscopic and
  photometric redshifts, B-band photometry and PGC numbers.
- **By:** Dálya et al. 2018, MNRAS 479, 2374.
- **Licence:** Not stated. The catalogue's page carries "© Copyright Gergely
  Dálya" and no licence; the VizieR ReadMe (VII/281) has no copyright section
  and the catalogue's VizieR page shows no licence line. skymap uses the copy
  CDS serves, and the CDS terms apply to it: "The data retrieved with VizieR
  are free of usage in a scientific context", and "The commercial usage of
  the data is subject to rules depending of the origin".
- **Use:** No licence stated
- **Attribution:** Cite the paper. (The page asks this in words for GLADE+,
  "Please cite this paper when using GLADE+ data", and names the 2018 paper as
  the description of v2.3.)
- **Upstream:** <https://glade.elte.hu/>;
  <https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=VII/281>
- **Enters skymap:** `data/raw/glade/glade2.3.dat` → `tools/parsers/glade.ts`.
- **Modified:** Yes. Deduplicated against SDSS and 2MRS, subsampled, re-encoded.
- **Checked:** 2026-10-07: <https://glade.elte.hu/>,
  <https://cds.unistra.fr/vizier-org/licences_vizier.html>,
  <https://cdsarc.cds.unistra.fr/ftp/VII/281/ReadMe>,
  <https://vizier.cds.unistra.fr/viz-bin/cat/VII/281>

### HyperLEDA

<!-- attribution: id=hyperleda; keys=hyperleda.* -->

- **What:** Position angle, axis ratio and diameter of GLADE galaxies; the
  `mod0` distance modulus used inside 30 Mpc; names and designations for the
  famous-galaxy list and the search aliases.
- **By:** Makarov et al. 2014, A&A 570, A13; Paturel et al. 2003, A&A 412, 45.
- **Licence:** Not stated on the database's page.
- **Use:** No licence stated
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
- **Use:** No licence stated
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
- **Licence:** CC BY 4.0: "for any purpose, including commercially, as long
  as they" cite the data release paper, "Indicate if any changes are made (if
  re-distributing DESI data)", and "Include the following acknowledgments
  text in any publications or derived works." DESI adds: "Also please cite
  publications from the Technical Papers section if they cover any material
  used in your work."
- **Use:** Free with credit
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
- **Licence:** Not stated for the table. The authors state none; the VizieR
  ReadMe (J/ApJ/944/94) carries no copyright or licence section and the
  catalogue's VizieR page shows no licence line. skymap uses the copy CDS
  serves, and the CDS terms apply to it: "The data retrieved with VizieR are
  free of usage in a scientific context", and "The commercial usage of the
  data is subject to rules depending of the origin". For a table from an AAS
  journal CDS points to the journal's policy, which says: "Authors of all AAS
  Journal articles accepted after 11 October 2021 will retain copyright in
  the published article and grant the AAS a non-exclusive CC-BY license to
  publish the article". The article's Crossref record names
  `creativecommons.org/licenses/by/4.0/` for the published article; whether
  that licence covers the copy of table 2 that CDS serves is said on neither
  page. An older sentence about tables from AAS journals is commented out of
  CDS's page and not displayed; it is quoted with the CDS terms and is not
  read as a licence here.
- **Use:** No licence stated
- **Attribution:** Cite Tully et al. 2023.
- **Upstream:** <https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/>
- **Enters skymap:** `npm run fetch-cf4` → `data/raw/cf4/table2.dat` →
  `tools/parsers/cosmicflows4.ts` → `tools/catalog/catalogDistanceFor.ts`.
- **Modified:** Yes. One distance per PGC number is read; it moves a galaxy's
  position.
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>,
  <https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ReadMe>,
  <https://vizier.cds.unistra.fr/viz-bin/cat/J/ApJ/944/94>,
  <https://journals.aas.org/article-charges-and-copyright/>,
  <https://api.crossref.org/works/10.3847/1538-4357/ac94d8>
- **Not verified:** the licence line on the article's own page (the
  publisher's site asked for a human check).

### Gaia DR3

<!-- attribution: id=gaia; keys=gaia.dir,gaia.readme,gaia.sha256; hosts=www.cosmos.esa.int -->

- **What:** Positions, `G` magnitude and `BP−RP` colour of the stars brighter
  than G = 14, from `gaiadr3.gaia_source_lite`.
- **By:** ESA and the Gaia Data Processing and Analysis Consortium (DPAC).
  Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1.
- **Licence:** "Gaia data are distributed under the CC BY-NC 3.0 IGO license.
  For details and guidelines concerning commercial use of the Gaia data, please
  see the Terms and Conditions for the use of data in the ESA space science
  archives." Those terms: "Prior to any commercial use by the User of any
  Data or Data Product, including any use or application that directly or
  indirectly generates a financial gain, a detailed request for
  authorisation/licence shall be made by the User by sending email to
  data.licences@esa.int."
- **Use:** Non-commercial only
- **Attribution:** The acknowledgement, verbatim:

  > This work has made use of data from the European Space Agency (ESA) mission Gaia (https://www.cosmos.esa.int/gaia), processed by the Gaia Data Processing and Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium). Funding for the DPAC has been provided by national institutions, in particular the institutions participating in the Gaia Multilateral Agreement.

- **Upstream:** <https://gea.esac.esa.int/tap-server/tap/sync> (the Gaia
  archive's TAP service).
- **Enters skymap:** `npm run fetch-gaia` → `data/raw/gaia/gaia_page_*.csv` →
  `npm run build-stars` → `public/data/star-catalog/`.
- **Modified:** Yes. Selected, given distances, deduplicated, quantised into an
  octree.
- **Checked:** 2026-10-07: <https://www.cosmos.esa.int/web/gaia-users/license>,
  <https://www.cosmos.esa.int/web/esdc/terms-and-conditions>,
  <https://gea.esac.esa.int/archive/documentation/GDR3/Miscellaneous/sec_credit_and_citation_instructions/>

### Bailer-Jones distances (Gaia EDR3)

<!-- attribution: id=bailer-jones -->

- **What:** Geometric and photogeometric distance estimates per star
  (`external.gaiaedr3_distance`), joined to the Gaia rows by `source_id`.
- **By:** Bailer-Jones et al. 2021, AJ 161, 147.
- **Licence:** No separate licence found; the table is served by the Gaia
  archive, whose data licence is quoted under Gaia DR3.
- **Use:** Non-commercial only
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
- **Use:** Non-commercial only
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
- **Licence:** Not stated. The ReadMe (I/311) carries no copyright or licence
  section and the catalogue's VizieR page shows no licence line. skymap uses
  the copy CDS serves, and the CDS terms apply to it: "The data retrieved
  with VizieR are free of usage in a scientific context", and "The
  commercial usage of the data is subject to rules depending of the origin".
  The policy of A&A, to which CDS points for a catalogue with no copyright
  statement, could not be opened.
- **Use:** No licence stated; Non-commercial only
- **Attribution:** Cite van Leeuwen 2007.
- **Upstream:** <https://cdsarc.cds.unistra.fr/ftp/I/311/>; the cross-match
  table comes from the Gaia archive (`gea.esac.esa.int`), under the terms
  quoted for Gaia DR3.
- **Enters skymap:** `npm run fetch-gaia` → `data/raw/gaia/hip2.dat` →
  `tools/parsers/hipparcos2.ts`.
- **Modified:** Yes. Merged into the star set in place of the matching Gaia rows.
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>,
  <https://cdsarc.cds.unistra.fr/ftp/I/311/ReadMe>,
  <https://vizier.cds.unistra.fr/viz-bin/cat/I/311>
- **Not verified:** A&A's copyright and open-access policy pages
  (`www.aanda.org` answered HTTP 403, to a browser too).

### Stars orbiting Sagittarius A\* (Gillessen et al. 2017)

<!-- attribution: id=s-stars -->

- **What:** Orbital elements of 39 bound S-stars (`J/ApJ/837/30/table3`), and
  astrometry of S2, S12 and S38 (`table5`) held as a test fixture only.
- **By:** Gillessen et al. 2017, ApJ 837, 30. The fixture's origin follows
  Plewa et al. 2015, MNRAS 453, 3234.
- **Licence:** Not stated for the tables. The authors state none; the VizieR
  ReadMe (J/ApJ/837/30) carries no copyright or licence section and the
  catalogue's VizieR page shows no licence line. The rows were typed from
  the copy CDS serves, and the CDS terms apply to it: "The data retrieved
  with VizieR are free of usage in a scientific context", and "The
  commercial usage of the data is subject to rules depending of the origin".
  For a table from an AAS journal CDS points to the journal's policy, which
  says: "The AAS holds the copyright for all non-gold-OA articles published
  in the Astronomical Journal, the Astrophysical Journal, Astrophysical
  Journal Letters, and the Astrophysical Journal Supplement Series prior to
  11 Oct 2021" and "Permission to reproduce material from articles for which
  the AAS holds the copyright is managed on behalf of the AAS by IOP
  Publishing." An older sentence about tables from AAS journals is commented
  out of CDS's page and not displayed; it is quoted with the CDS terms and
  is not read as a licence here.
- **Use:** No licence stated
- **Attribution:** Cite Gillessen et al. 2017.
- **Upstream:** <https://vizier.cds.unistra.fr/viz-bin/VizieR?-source=J/ApJ/837/30>
- **Enters skymap:** typed by hand into `src/data/bodies/sStarElements.ts`
  (one source line per row) and `tests/fixtures/sStarAstrometry.json`.
- **Modified:** No values changed. The 40th published row, S111, is left out as
  unbound.
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>,
  <https://cdsarc.cds.unistra.fr/ftp/J/ApJ/837/30/ReadMe>,
  <https://vizier.cds.unistra.fr/viz-bin/cat/J/ApJ/837/30>,
  <https://journals.aas.org/article-charges-and-copyright/>

### S301 (GRAVITY Collaboration 2026)

<!-- attribution: id=s301 -->

- **What:** One more orbit around Sagittarius A\*, Solution A of the paper's
  Extended Data Table 2.
- **By:** Abd El Dayem et al. (GRAVITY Collaboration) 2026, "Discovery of a
  star sensitive to the spin of Sgr A\*", Nature,
  doi:10.1038/s41586-026-10894-w.
- **Licence:** A published paper; seven numbers are transcribed. The journal's
  terms were not read.
- **Use:** Reference only
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
- **Use:** Reference only
- **Attribution:** Cite the paper.
- **Upstream:** A&A 625, L10 (the journal; no link is recorded in the repository).
- **Enters skymap:** `src/data/bodies/sgrAStarMassSolar.ts`,
  `src/data/bodies/sStarOrbitInfo.ts` and the S-star scale.
- **Modified:** No.
- **Checked:** 2026-10-07: no page opened.
- **Not verified:** the paper itself.

### Main-sequence temperatures and radii (Pecaut & Mamajek 2013)

<!-- attribution: id=pecaut-mamajek -->

- **What:** The scale against which the S-stars' representative temperatures
  and radii were spot-checked.
- **By:** Pecaut & Mamajek 2013, ApJS 208, 9.
- **Licence:** A published paper; used as a reference scale.
- **Use:** Reference only
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
- **Use:** No licence stated
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
- **Use:** No licence stated
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
- **Licence:** Not stated. The ReadMe carries no copyright or licence section
  and the catalogue's VizieR page shows no licence line. skymap uses the copy
  CDS serves, and the CDS terms apply to it: "The data retrieved with VizieR
  are free of usage in a scientific context", and "The commercial usage of
  the data is subject to rules depending of the origin". The policy of A&A,
  to which CDS points for a table from that journal, could not be opened. An
  older sentence about tables from A&A is commented out of CDS's page and
  not displayed; it is quoted with the CDS terms and is not read as a
  licence here.
- **Use:** No licence stated
- **Attribution:** Cite Piffaretti et al. 2011.
- **Upstream:** <https://cdsarc.cds.unistra.fr/ftp/J/A+A/534/A109/>
- **Enters skymap:** `npm run fetch-structures` → `data/raw/mcxc/mcxc.dat` →
  `tools/structures/buildStructures.ts` → `public/data/structure-catalog/`.
- **Modified:** Yes. Filtered by mass; hand-placed anchors win over catalogue
  rows near them.
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>,
  <https://cdsarc.cds.unistra.fr/ftp/J/A+A/534/A109/ReadMe>,
  <https://vizier.cds.unistra.fr/viz-bin/cat/J/A+A/534/A109>
- **Not verified:** A&A's copyright and open-access policy pages
  (`www.aanda.org` answered HTTP 403, to a browser too).

### MSCC, the Main SuperCluster Catalogue

<!-- attribution: id=mscc; keys=mscc.* -->

- **What:** 601 superclusters of Abell/ACO clusters (VizieR J/MNRAS/445/4073).
- **By:** Chow-Martínez et al. 2014, MNRAS 445, 4073.
- **Licence:** Not stated. The ReadMe carries no copyright or licence section
  and the catalogue's VizieR page shows no licence line. skymap uses the copy
  CDS serves, and the CDS terms apply to it: "The data retrieved with VizieR
  are free of usage in a scientific context", and "The commercial usage of
  the data is subject to rules depending of the origin". The policy of
  MNRAS, to which CDS points for a table from that journal, could not be
  opened.
- **Use:** No licence stated
- **Attribution:** Cite Chow-Martínez et al. 2014.
- **Upstream:** <https://cdsarc.cds.unistra.fr/ftp/J/MNRAS/445/4073/>
- **Enters skymap:** `npm run fetch-structures` → `data/raw/mscc/mscc.dat` →
  `tools/structures/buildStructures.ts`.
- **Modified:** Yes. Filtered by richness.
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>,
  <https://cdsarc.cds.unistra.fr/ftp/J/MNRAS/445/4073/ReadMe>,
  <https://vizier.cds.unistra.fr/viz-bin/cat/J/MNRAS/445/4073>
- **Not verified:** the MNRAS policy on catalogues (`academic.oup.com`
  answered HTTP 403, and a security check to a browser).

### Constellation lines (d3-celestial)

<!-- attribution: id=d3-celestial; keys=constellations.* -->

- **What:** Stick-figure vertices of the 88 constellations
  (`data/constellations.lines.json`, pinned commit in the README).
- **By:** Olaf Frohn.
- **Licence:** BSD 3-Clause. "Copyright (c) 2015, Olaf Frohn. All rights
  reserved."
- **Use:** Free with credit
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
- **Licence:** The CDS terms, which state no licence: "The data retrieved
  with VizieR are free of usage in a scientific context; however, as it is
  the usage in scientific publication, the original authors and publication
  references including the publisher have to be explicitely cited", and "The
  commercial usage of the data is subject to rules depending of the origin".
  Of the service itself: "The Information system including the metadata is
  private and reserved to the CDS."
- **Use:** Reference only
- **Attribution:** Optional. "If the access to catalogues with VizieR was
  helpful for your research work, the following acknowledgment would be
  appreciated": "This research has made use of the VizieR catalogue access
  tool, CDS, Strasbourg, France (DOI : 10.26093/cds/vizier). The original
  description of the VizieR service was published in 2000, A&AS 143, 23".
  CDS's general terms ask more firmly: "The Data Sets must be cited in any
  work or product that uses them by including - if available - the DOI
  (Digital Object Identifier), as well as the source by mentioning the CDS
  service that supplied them".
- **Upstream:** <https://vizier.cds.unistra.fr/>
- **Enters skymap:** `tools/fetch/fetch2massXsc.ts`, `fetchCosmicflows4.ts`,
  `fetchStructureCatalogs.ts`, `fetchGaia.ts` (build time only).
- **Modified:** Not applicable (a service).
- **Checked:** 2026-10-07: <https://cds.unistra.fr/vizier-org/licences_vizier.html>,
  <https://cds.unistra.fr/legals/>

## Fields, volumes and structures

### CF4++ density and velocity grids (Cosmicflows-4)

<!-- attribution: id=cf4pp; keys=cf4.density-mean,cf4.vfield-mean,cf4.vfield-npz,cf4.dir; hosts=projets.ip2i.in2p3.fr -->

- **What:** Mean velocity and density on a 128³ grid in a 1000 Mpc box
  (`CF4pp_mean_std_grids.npz`), drawn as the flow field.
- **By:** Courtois, Mould, Hollinger, Dupuy & Zhang 2025, A&A 701, 187
  ([arXiv:2502.01308](https://arxiv.org/abs/2502.01308)), built on the
  Cosmicflows-4 distances of Tully et al. 2023.
- **Licence:** Not stated on the project's page.
- **Use:** No licence stated
- **Attribution:** "If you use this data cite the article above" (the page, of
  each download).
- **Upstream:** <https://projets.ip2i.in2p3.fr/cosmicflows/>, the page the
  file was downloaded from. `rawDataRegistry.ts` gives the density array
  (`cf4.density-mean`) a different upstream, the Extragalactic Distance
  Database's CF4 calculator (`https://edd.ifa.hawaii.edu/CF4calculator/`);
  the array is cut from the npz above, so the registry's link looks wrong,
  and that site could not be reached today to read its terms.
- **Enters skymap:** `data/raw/cf4/CF4pp_mean_std_grids.npz` (the two mean
  arrays are also hosted on R2 for contributors) → `npm run build-flow-field` →
  `public/data/scalar-field/v3/flowfield.scfd`.
- **Modified:** Yes. Two of the six arrays are packed to 16-bit floats.
- **Checked:** 2026-10-07: <https://projets.ip2i.in2p3.fr/cosmicflows/>
- **Not verified:** the Extragalactic Distance Database's terms
  (`edd.ifa.hawaii.edu` did not answer).

### SDSS Cosmic Slime value-added catalogue (MCPM density)

<!-- attribution: id=mcpm-vac; keys=mcpm.dir -->

- **What:** A 712×1200×728 density cube fitted to SDSS galaxies by the Monte
  Carlo Physarum Machine (`SDSS_z_44-476mpc`), drawn as the cosmic web glow.
- **By:** Wilde et al. 2023 ([arXiv:2301.02719](https://arxiv.org/abs/2301.02719));
  method: Burchett et al. 2020, Elek et al. 2021.
- **Licence:** The catalogue's own page states no terms. It is a value-added
  catalogue of SDSS DR17, and SDSS says of its releases in general: "All SDSS
  data released in our public data releases is considered in the public
  domain." Whether SDSS means that sentence to cover catalogues contributed
  by its members is not said on either page.
- **Use:** No licence stated
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
- **Use:** Free with credit
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
- **Use:** No licence stated
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
- **Use:** Free with credit
- **Attribution:** Cite the paper and the dataset, doi:10.5281/zenodo.8187943.
- **Upstream:** <https://zenodo.org/records/8187943>
- **Enters skymap:** downloaded as `data/raw/edenhofer/README.md` describes →
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
- **Use:** Free, no credit asked
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
- **Licence:** The repository's `License.txt`: "This software is
  'dual-licensed', you have to choose one of the two licenses below to apply:
  CeCILL-C : a LGPL like license … CeCILL v2.0 : a GPL like license". The
  program is run, not shipped or linked.
- **Use:** Copyleft code
- **Attribution:** Cite Sousbie 2011.
- **Upstream:** <https://github.com/thierry-sousbie/DisPerSE>
- **Enters skymap:** `npm run build-filaments` → `data/raw/filaments/` →
  `public/data/filament/v1/filaments.bin`.
- **Modified:** Not applicable: the output is our own derived product.
- **Checked:** 2026-10-07: <https://api.github.com/repos/thierry-sousbie/DisPerSE/license>

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
- **Use:** Per item
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

Where the per-image record (`data/seeds/famous_curated_overrides.json`, and
the `recipe.json` shipped beside each image) differs from what the source
states. The record is a shipped file and was not edited:

| image | the record says | the source says (read 2026-10-07) |
| --- | --- | --- |
| `c29` NGC 5005 | `"license": "unknown"` | NOIRLab: CC BY 4.0 ("Unless specifically noted"; the page carries no note). Credit on the page: "KPNO/NOIRLab/NSF/AURA/Ray and Emily Magnani/Adam Block" |
| `m88` | `"Public domain"` | NOIRLab: CC BY 4.0, no note on the page. Credit: "KPNO/NOIRLab/NSF/AURA/Jim Quinn/Adam Block" |
| `m91` | `"Public Domain"` | NOIRLab: CC BY 4.0, no note on the page. Credit: "NOIRLab/ NSF /AURA" |
| `m94` | `"CC 4.0"` | NOIRLab: CC BY 4.0, no note on the page. Credit: "Hillary Mathis, N.A.Sharp/NOIRLab/ NSF /AURA/" |
| `c17` NGC 147, `c18` NGC 185 | `"license": "unknown"`, author "Digital Sky Survey" / "Digitized Sky Survey 2", taken from theskylive.com | Not opened (HTTP 403). If they are DSS frames, the terms are those under "Digitized Sky Survey cutouts" below: copyrighted, free for non-profit use, commercial use "prohibited without written permission from the copyright holder(s)" |

Each of the four NOIRLab pages also says: "Crediting this image with the full
credit line, in a visible way is MANDATORY, if you want to use it without
paying a fee."

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
- **Use:** Share-alike
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
- **Use:** Per item
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
  credits." (the SDSS-IV policy page). The page of the current phase, which
  serves DR18, says the same in other order: "any SDSS image on the SDSS Web
  site may be downloaded, linked to, or otherwise used for any purpose,
  provided that you maintain the image credits … We provide all images on a
  Creative Commons Attribution license (CC-BY)." Both add: "Your use of the
  image does not imply our endorsement of any product or service".
- **Use:** Free with credit
- **Attribution:** "Unless otherwise stated, images should be credited to the
  Sloan Digital Sky Survey."
- **Upstream:** `https://skyserver.sdss.org/dr18/SkyServerWS/ImgCutout/getjpeg`
- **Enters skymap:** `src/utils/math/sdssThumbnailUrl.ts` →
  `src/utils/network/fetchGalaxyBitmap.ts`, in the visitor's browser; nothing
  is stored by skymap.
- **Modified:** Drawn on a disc with a faded edge.
- **Checked:** 2026-10-07: <https://www.sdss4.org/collaboration/#image-use>,
  <https://www.sdss.org/collaboration/#image-use>

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
  copyright holder(s). Contact archive@stsci.edu for details." And, of what
  skymap fetches: "Color DSS Images: For use of color DSS images not covered
  by above use policy, contact archive@stsci.edu." The holders are Caltech, the Anglo-Australian
  Observatory Board, the UK SERC/PPARC (now STFC) and AURA, by plate. The CDS
  tile set names `hips_license = ODbL-1.0` and `obs_copyright = Digitized Sky
  Survey - STScI/NASA, Colored & Healpixed by CDS`.
- **Use:** Ask the holder
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
- **By:** Mikita Misiura (StarNet).
- **Licence:** None stated for StarNet2. The site carries "© 2026 Mikita
  Misiura. All rights reserved." on the pages read, the command-line tools
  page included, and no licence. The author's earlier public repository
  (StarNet v1) states: "Code is available
  under MIT License" and "Weights are available under
  Attribution-NonCommercial-ShareAlike 4.0 International Creative Commons
  license … You can **NOT** use them for commercial purposes. You must give
  appropriate credit for usage of these weights." Whether that statement
  covers the StarNet2 weights used here is not established.
- **Use:** Ask the holder
- **Attribution:** Credit StarNet (the v1 statement above).
- **Upstream:** <https://www.starnetastro.com/>
- **Enters skymap:** `tools/famous-curator/plugin/starnet.ts`, at curation time;
  weights downloaded by hand to `data/starnet/`.
- **Modified:** No.
- **Checked:** 2026-10-07: <https://www.starnetastro.com/>,
  <https://www.starnetastro.com/cli-tools/>,
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
source of the material." Under "COMMERCIAL USE": "For use of NASA images
clearances may be necessary for images that include any NASA logos or NASA
employees to be used as cover art or in promotional content. Otherwise, NASA
imagery can be generally used editorially within published works that are not
promotional in nature. If the NASA material is to be used for commercial
purposes, including advertisements, it must not explicitly or implicitly convey
NASA’s endorsement of commercial goods or services." The same page says "The
NASA Insignia, Logotype, identifiers, and imagery are not in the public
domain." (<https://www.nasa.gov/nasa-brand-center/images-and-media/>, read
2026-10-07.) NASA's statement is about the United States ("generally are not
subject to copyright in the United States"); it says nothing of other
countries.

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
- **Use:** Free with credit
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
- **Use:** Free, no credit asked
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
- **Use:** Free with credit
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
- **Use:** Conditions apply
- **Attribution:** "Credits: NASA/JPL-Caltech/Space Science Institute/Lunar and
  Planetary Institute".
- **Upstream:** <https://science.nasa.gov/photojournal/color-maps-of-mimas-2014/>
  and its four siblings; the files are on `assets.science.nasa.gov`.
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
- **Use:** No licence stated
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
- **Use:** Free with credit
- **Attribution:** Schenk & McKinnon 2024, Icarus 408,
  doi:10.1016/j.icarus.2023.115827.
- **Upstream:** <https://astrogeology.usgs.gov/search/map/enceladus-cassini-global-dem-200m-schenk>;
  the file is on USGS's bucket `asc-astropedia.s3.us-west-2.amazonaws.com`.
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
- **Use:** No licence stated
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
- **Use:** Free with credit
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
- **Use:** Conditions apply
- **Attribution:** "NASA/Johns Hopkins University Applied Physics
  Laboratory/Southwest Research Institute" and, for the true-colour view,
  "…/Alex Parker".
- **Upstream:** <https://science.nasa.gov/photojournal/pluto-color-map/>,
  <https://science.nasa.gov/resource/true-colors-of-pluto/>; the files are on
  `assets.science.nasa.gov`.
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
- **Use:** Free with credit
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
- **Use:** No licence stated
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
- **Use:** Conditions apply
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
- **Use:** Conditions apply
- **Attribution:** "NASA should be acknowledged as the source of the
  material." Ours: "NASA Earth Observatory", and for night lights "NASA Earth
  Observatory / NASA's Goddard Space Flight Center, Suomi NPP VIIRS".
- **Upstream:** <https://visibleearth.nasa.gov/>; the files themselves come
  from `assets.science.nasa.gov` and `eoimages.gsfc.nasa.gov` (URLs in the
  registry). The water mask is fetched from the Internet Archive's copy
  (`web.archive.org`) of NASA's retired NEO archive.
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
- **Use:** Non-commercial only; Share-alike
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
- **Use:** Free with credit
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
- **Licence:** CC0 1.0. NOAA's metadata record for the dataset: "These data
  were produced by NOAA and are not subject to copyright protection in the
  United States. NOAA waives any potential copyright and related rights in
  these data worldwide through the Creative Commons Zero 1.0 Universal Public
  Domain Dedication (CC0-1.0)." and "SPDX License: Creative Commons Zero v1.0
  Universal (CC0-1.0)". Under use limitations it says: "Not to be used for
  navigation." The product page itself states no licence.
- **Use:** Free with credit
- **Attribution:** None required by CC0. The record asks: "Cite as: NOAA
  National Centers for Environmental Information. 2022: ETOPO 2022 15
  Arc-Second Global Relief Model. NOAA National Centers for Environmental
  Information. https://doi.org/10.25921/fd45-gt74. Accessed [date]."
- **Upstream:** <https://www.ncei.noaa.gov/products/etopo-global-relief-model>;
  the tiles are on `www.ngdc.noaa.gov`.
- **Enters skymap:** `npm run fetch-height` → `data/raw/etopo/` →
  `build-surface-tiles` → `earth-tiles/…/height/`.
- **Modified:** Yes. Re-gridded, quantised to 0.1 m; water flattened to its
  shore level.
- **Checked:** 2026-10-07: <https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ngdc.mgg.dem:etopo_2022>,
  <https://www.ncei.noaa.gov/products/etopo-global-relief-model>

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
- **Use:** Per item
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
- **Use:** Free with credit
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
- **Use:** Free with credit; Copyleft code
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
- **Use:** Free, no credit asked
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
- **Use:** Free, no credit asked
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
- **Use:** Free with credit; No licence stated
- **Attribution:** Credit the authors. The DEM's record gives "Recommended
  Citation: Calef III, F.J. and Parker, T., 2016, MSL Gale Merged Orthophoto
  Mosaic, Publisher: PDS Annex, U.S. Geological Survey,
  https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m" (the
  record's own words, title included); the orthophoto's: "Calef III, F. J., &
  Parker, T. (2016). MSL Gale Merged Orthophoto Mosaic. PDS Annex, U.S.
  Geological Survey." The string in the tile manifest is
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
- **Use:** Free with credit
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
- **Use:** Free, no credit asked
- **Attribution:** None required by CC0. Ours: "HiRISE: NASA/JPL/University of
  Arizona; DTEEC_…, USGS Astrogeology (CC0)."
- **Upstream:** `https://astrogeo-ard.s3-us-west-2.amazonaws.com/mars/mro/hirise/controlled/dtm/`
- **Enters skymap:** fetched by hand → `marsSurfaceBake.ts`.
- **Modified:** Yes. Re-tiled; the grey orthophotos are coloured from Viking.
- **Checked:** 2026-10-07: no record could be opened (the STAC collection
  addresses tried answered 404).
- **Not verified:** the CC0 statement today.

## 3D models

Each model is shipped as a derivative under `public/data/meshes/<key>*`; the
raw downloads are gitignored and `data/raw/meshes/<key>/README.md` records
each one. The credit string of each model is copied by `npm run build-meshes`
into `src/data/bodies/meshAssets.generated.ts`.

The NASA models come from NASA 3D Resources, whose repository says: "These
assets are free and without copyright. Please read the usage guidelines."
Those guidelines are NASA's media guidelines, quoted under "Solar-system
textures" above. The app ships the string `Public domain (NASA)` as the
`licence` of each of the five NASA models (`meshAssets.generated.ts`, copied
from the hand-written `tools/utils/io/meshSources.ts`); those are not NASA's
words, which are "generally are not subject to copyright in the United
States" and "The NASA Insignia, Logotype, identifiers, and imagery are not in
the public domain". The string was left as it is: the generated file is
rewritten only by `npm run build-meshes`, which re-bakes the models.

### "Livyatan melvillei" by Major (the whale)

<!-- attribution: id=mesh-whale; keys=meshes.whale*; hosts=sketchfab.com -->

- **What:** The whale of the pair of bodies in orbit around Earth.
- **By:** Major (<https://sketchfab.com/majorgalah>).
- **Licence:** CC BY 4.0 ("License: CC Attribution", linking the 4.0 deed).
- **Use:** Free with credit
- **Attribution:** Verbatim, as Sketchfab words it:

  > This work is based on "Livyatan melvillei" (https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba) by Major (https://sketchfab.com/majorgalah) licensed under CC-BY-4.0

- **Upstream:** <https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba>
- **Enters skymap:** downloaded by hand → `npm run build-meshes` →
  `public/data/meshes/whale.*`.
- **Modified:** Yes. Rig removed, primitives merged, textures resized.
- **Checked:** 2026-10-07: <https://sketchfab.com/3d-models/livyatan-melvillei-8313bd7fde514b108c9ef469817b62ba>

### "Flowers Petunia White" by Marianne Goudriaan (the bowl of petunias)

<!-- attribution: id=mesh-petunias; keys=meshes.petunias* -->

- **What:** The bowl of petunias trailing the whale.
- **By:** Marianne Goudriaan (<https://sketchfab.com/mariannegoudriaan>).
- **Licence:** CC BY 4.0 ("License: CC Attribution", linking the 4.0 deed).
- **Use:** Free with credit
- **Attribution:** Verbatim:

  > This work is based on "Flowers Petunia White" (https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0) by Marianne Goudriaan (https://sketchfab.com/mariannegoudriaan) licensed under CC-BY-4.0

- **Upstream:** <https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0>
- **Enters skymap:** downloaded by hand → `npm run import-mesh -- petunias`,
  `npm run prebake-mesh -- petunias` (Blender) → `npm run build-meshes`.
- **Modified:** Yes. Eleven materials baked into one set of atlases.
- **Checked:** 2026-10-07: <https://sketchfab.com/3d-models/74c653b4413f40ba8ec753004b2deea0>

### "Voyager Probe (B)" (Voyager 1 and 2)

<!-- attribution: id=mesh-voyager; keys=meshes.voyager*; hosts=science.nasa.gov -->

- **What:** The model drawn for both Voyager spacecraft.
- **By:** The page gives "Source NASA/Michael D. Carbajal".
- **Licence:** NASA's media guidelines.
- **Use:** Conditions apply
- **Attribution:** NASA asks to be acknowledged as the source. Ours: "NASA /
  Michael D. Carbajal (NASA Headquarters)".
- **Upstream:** <https://science.nasa.gov/3d-resources/voyager-probe-b/>
- **Enters skymap:** downloaded by hand → Blender pre-bake → `build-meshes`.
- **Modified:** Yes. Flattened to one mesh and one set of atlases.
- **Checked:** 2026-10-07: <https://science.nasa.gov/3d-resources/voyager-probe-b/>,
  <https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/README.md>,
  <https://www.nasa.gov/nasa-brand-center/images-and-media/>

### "Hubble Space Telescope (A)"

<!-- attribution: id=mesh-hubble; keys=meshes.hubble* -->

- **What:** The Hubble model, the textured variant found only in NASA's GitHub
  mirror of the collection.
- **By:** NASA; the mirror names no individual modeller.
- **Licence:** NASA's media guidelines. GitHub reports no licence file for the
  repository; its README carries the sentence quoted above.
- **Use:** Conditions apply
- **Attribution:** Ours: "NASA, "Hubble Space Telescope (A)" — NASA 3D
  Resources".
- **Upstream:** <https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/Hubble%20Space%20Telescope%20(A)>
- **Enters skymap:** downloaded by hand → `npm run import-mesh -- hubble`,
  `npm run prebake-mesh -- hubble` → `build-meshes` →
  `public/data/meshes/hubble.*`.
- **Modified:** Yes. Scaled from inches to metres, foil materials made
  metallic, flattened to one set of atlases.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/nasa/NASA-3D-Resources/master/README.md>,
  <https://api.github.com/repos/nasa/NASA-3D-Resources>

### "Mars 2020 Perseverance Rover"

<!-- attribution: id=mesh-perseverance; keys=meshes.perseverance* -->

- **What:** The Perseverance model.
- **By:** The page gives "Source NASA/Jet Propulsion Laboratory". Our shipped
  credit names Brian Kumanchik, NASA/JPL-Caltech; the page does not name him
  today (the collection's README lists him as a contributor, without saying
  which models are his).
- **Licence:** NASA's media guidelines.
- **Use:** Conditions apply
- **Attribution:** Ours: "Brian Kumanchik, NASA/JPL-Caltech".
- **Upstream:** <https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/>
- **Enters skymap:** downloaded by hand → Blender pre-bake → `build-meshes`.
- **Modified:** Yes. Posed mast-up, reduced to 100k triangles, flattened.
- **Checked:** 2026-10-07: <https://science.nasa.gov/3d-resources/mars-2020-perseverance-rover/>

### "Curiosity Rover (MSL) (Clean)"

<!-- attribution: id=mesh-curiosity; keys=meshes.curiosity* -->

- **What:** The Curiosity model.
- **By:** The page's metadata names "NASA/Brian E. Kumanchik".
- **Licence:** NASA's media guidelines.
- **Use:** Conditions apply
- **Attribution:** Ours: "Brian Kumanchik, NASA/JPL-Caltech".
- **Upstream:** <https://science.nasa.gov/3d-resources/curiosity-rover-msl/>
- **Enters skymap:** downloaded by hand (a zip holding one `.blend`) → Blender
  import and pre-bake → `build-meshes`.
- **Modified:** Yes. Three defects of the source repaired, flattened.
- **Checked:** 2026-10-07: <https://science.nasa.gov/3d-resources/curiosity-rover-msl/>

### "Mars Exploration Rover - Spirit and Opportunity"

<!-- attribution: id=mesh-mer; keys=meshes.mer* -->

- **What:** One model drawn for both rovers.
- **By:** No author was found on the page today. Ours: "NASA/JPL-Caltech".
- **Licence:** NASA's media guidelines.
- **Use:** Conditions apply
- **Attribution:** Ours: "NASA/JPL-Caltech".
- **Upstream:** <https://science.nasa.gov/3d-resources/mars-exploration-rover-spirit-and-opportunity/>;
  the file itself comes from <https://github.com/nasa/NASA-3D-Resources>,
  because the page's own download link was dead when it was fetched.
- **Enters skymap:** downloaded by hand → Blender pre-bake → `build-meshes`.
- **Modified:** Yes. Posed deployed, flattened.
- **Checked:** 2026-10-07: <https://science.nasa.gov/3d-resources/mars-exploration-rover-spirit-and-opportunity/>

## Fonts

All three are under the SIL Open Font License 1.1, whose second condition
reads: "Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy contains
the above copyright notice and this license." Each project's `OFL.txt`, with
its copyright line, is copied from its repository beside the font files:
`public/fonts/OFL-CormorantGaramond.txt`, `OFL-Sora.txt` and `OFL-Jost.txt`
(the build copies `public/` as it is, so the deploy serves them at
`/fonts/OFL-*.txt`, the one deploy that holds both the app and the website),
and an `OFL.txt` beside each other copy of Cormorant Garamond in the
repository (`data/raw/fonts/`, `tools/site/fonts/`,
`packages/website/src/assets/fonts/`). The website's own font files are
written to `_astro/` under hashed names, away from those texts. Whether the
font files' own metadata carries the notice was not checked. None of the
three projects declares a Reserved Font Name in its `OFL.txt`.

### Cormorant Garamond

<!-- attribution: id=font-cormorant; keys=fonts.dir -->

- **What:** The display face: labels in the app (an MSDF atlas), headings of
  the app's panels and of the website, the social card.
- **By:** Christian Thalmann (Catharsis Fonts). "Copyright 2015 the Cormorant
  Project Authors (github.com/CatharsisFonts/Cormorant)".
- **Licence:** SIL Open Font License 1.1.
- **Use:** Share-alike
- **Attribution:** The copyright notice and licence with each copy (see above).
- **Upstream:** <https://github.com/CatharsisFonts/Cormorant>
- **Enters skymap:** `data/raw/fonts/CormorantGaramond-SemiBold.ttf` →
  `npm run build-fonts` → `public/fonts/cormorant.{json,webp}`;
  `public/fonts/CormorantGaramond-SemiBold.woff2`;
  `tools/site/fonts/CormorantGaramond-SemiBold.ttf`;
  `packages/website/src/assets/fonts/cormorant-garamond-600-site.woff2`.
- **Modified:** Yes. Subsetted to WOFF2, and rasterised into a distance-field
  atlas.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/CatharsisFonts/Cormorant/master/OFL.txt>

### Sora

<!-- attribution: id=font-sora -->

- **What:** Sora Thin, the face of the exhibit titles in the app.
- **By:** "Copyright 2019 The Sora Project Authors
  (https://github.com/sora-xor/sora-font)".
- **Licence:** SIL Open Font License 1.1.
- **Use:** Share-alike
- **Attribution:** The copyright notice and licence with each copy.
- **Upstream:** <https://github.com/sora-xor/sora-font>
- **Enters skymap:** `public/fonts/Sora-Thin.woff2` (`@font-face` in
  `src/styles/tokens.css`).
- **Modified:** Converted to WOFF2; whether it was subsetted is not recorded.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/sora-xor/sora-font/master/OFL.txt>

### Jost

<!-- attribution: id=font-jost -->

- **What:** The text face of the website.
- **By:** indestructible type\*. "Copyright 2020 The Jost Project Authors
  (https://github.com/indestructible-type/Jost)".
- **Licence:** SIL Open Font License 1.1.
- **Use:** Share-alike
- **Attribution:** The copyright notice and licence with each copy.
- **Upstream:** <https://github.com/indestructible-type/Jost>
- **Enters skymap:** the npm package `@fontsource-variable/jost`
  (`packages/website/package.json`), bundled by the site build.
- **Modified:** No.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/indestructible-type/Jost/master/OFL.txt>

## Code and methods

### "Spiral galaxy" by mrange (seven helper functions)

<!-- attribution: id=mrange; hosts=www.shadertoy.com -->

- **What:** Seven small functions that came with a port of the "Spiral
  galaxy" ShaderToy, which once drew the Milky Way. That shader is no longer
  in the repository; these helpers are what remains, and other shaders use
  them: `hash21` (the shader's `rand`), `valueNoise2` (its `noise1`) and
  `raySphere` in `src/services/gpu/shaders/lib/util.wesl`; `rot2` (its
  `rot`), `sabs` (its `SABS` and `LESS` macros), `toPolar` and `toRect` in
  `src/services/gpu/shaders/lib/math.wesl`.
- **By:** mrange (<https://www.shadertoy.com/user/mrange>).
- **Licence:** CC0. The shader's first line: "// License CC0: Spiral galaxy".
  Read today in a third party's copy of ShaderToy's own API output for the
  shader (a backup made on 5 October 2024), not on ShaderToy, which refuses
  scripted requests.
- **Use:** Free, no credit asked
- **Attribution:** None required by CC0; `util.wesl` names the source,
  `math.wesl` says only "the ShaderToy GLSL original".
- **Upstream:** <https://www.shadertoy.com/view/wsBBWD>
- **Enters skymap:** hand-ported to WGSL.
- **Modified:** Yes. Translated from GLSL; `rot2` returns its result instead
  of changing its argument.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/GabeRundlett/shadertoy-api-shaders/f6d538adf936215ccf2d11ba9b4a6c79ccb448c5/shaders/wsBBWD.json>
  (a copy); ShaderToy itself answered HTTP 403.
- **Not verified:** the licence line on ShaderToy's own page today.

### "Hash without Sine" by Dave Hoskins

<!-- attribution: id=hoskins-hash; hosts=www.shadertoy.com -->

- **What:** `hash21Hq` in `src/services/gpu/shaders/lib/util.wesl` (the
  shader's `hash12`), used by other shaders for jitter.
- **By:** David Hoskins, 2014.
- **Licence:** MIT. The header of the shader's code, as read today in a third
  party's copy of ShaderToy's own API output (a backup made on 5 October
  2024), not on ShaderToy, which refuses scripted requests:

  > Hash without Sine. MIT License... Copyright (c)2014 David Hoskins. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

  The same copy shows the shader's sound tab under a different header,
  "License Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Unported
  License"; the hashes, `hash12` among them, are in the tab headed by the MIT
  notice.
- **Use:** Free with credit
- **Attribution:** The licence asks that "The above copyright notice and this
  permission notice shall be included in all copies or substantial portions
  of the Software." The notice is quoted whole above, and `util.wesl` names
  the author, the licence and this entry.
- **Upstream:** <https://www.shadertoy.com/view/4djSRW>
- **Enters skymap:** hand-ported to WGSL.
- **Modified:** Yes. Translated from GLSL.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/GabeRundlett/shadertoy-api-shaders/f6d538adf936215ccf2d11ba9b4a6c79ccb448c5/shaders/4djSRW.json>
  (a copy); ShaderToy itself answered HTTP 403.
- **Not verified:** the header on ShaderToy's own page today; ShaderToy's
  terms, which are said to set a default licence for shaders that state none
  (the page answered HTTP 403).

### HEALPix pixel indexing

<!-- attribution: id=healpix -->

- **What:** `src/utils/math/healpixNest.ts`, which turns a sky direction into
  a nested HEALPix pixel index (used to weigh survey coverage). The app
  ships it.
- **By:** The scheme: Górski et al. 2005, ApJ 622, 759. The code: the function
  follows `ang2pix_nest_z_phi` of the HEALPix C library's `chealpix.c`
  statement by statement, with the same variable names (`temp1`, `temp2`,
  `jp`, `jm`, `ifp`, `ifm`, `ntt`, `tp`, `tmp`) and the same expressions
  (`(ifp|4)`, `ifm+8`, `nside*sqrt(3*(1-za))`). `chealpix.c` is "Copyright (C)
  1997-2016 Krzysztof M. Gorski, Eric Hivon, Martin Reinecke, Benjamin D.
  Wandelt, Anthony J. Banday, Matthias Bartelmann, Reza Ansari & Kenneth M.
  Ganga".
- **Licence:** GNU General Public License, version 2 or later, for
  `chealpix.c`. Its header: "HEALPix is free software; you can redistribute
  it and/or modify it under the terms of the GNU General Public License as
  published by the Free Software Foundation; either version 2 of the
  License, or (at your option) any later version." skymap's own code is
  under MIT; this file's origin is under the GPL. Until 2026-10-07 the
  file's header named "healpy's `pixelfunc.lonlat_to_healpix` (BSD-licensed)"
  as its source. No such function exists in healpy, whose `COPYING` is the
  GNU GPL version 2; `lonlat_to_healpix` belongs to astropy-healpix, which is
  BSD 3-Clause ("Copyright (c) 2016-2018, Astropy Developers") and wraps a
  different C implementation, from Astrometry.net, that this file does not
  resemble.
- **Use:** Copyleft code
- **Attribution:** Cite Górski et al. 2005. The GPL asks that a work based on
  the program be licensed as a whole under the GPL when distributed, with the
  copyright notice kept.
- **Upstream:** <https://healpix.sourceforge.io/>;
  <https://github.com/healpy/healpixmirror> (healpy's mirror of the library's
  source); <https://github.com/astropy/astropy-healpix>
- **Enters skymap:** written by hand in TypeScript.
- **Modified:** Yes. Translated from C; the bit interleave is written anew.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/healpy/healpixmirror/trunk/src/C/subs/chealpix.c>
  (a mirror kept by the healpy project; the library's own site answered HTTP
  403), <https://raw.githubusercontent.com/healpy/healpy/main/COPYING>,
  <https://raw.githubusercontent.com/healpy/healpy/main/lib/healpy/pixelfunc.py>,
  <https://raw.githubusercontent.com/astropy/astropy-healpix/main/LICENSE.md>,
  <https://raw.githubusercontent.com/astropy/astropy-healpix/main/astropy_healpix/core.py>
- **Not verified:** the licence page on the HEALPix site itself; from which
  file the code was in fact written (no record beyond the old header).

### Colour temperature to RGB (Tanner Helland)

<!-- attribution: id=helland; hosts=tannerhelland.com -->

- **What:** The piecewise fit in `src/utils/color/temperatureToLinearRgb.ts`
  that gives a star its colour from its temperature.
- **By:** Tanner Helland, "How to Convert Temperature (K) to RGB: Algorithm
  and Sample Code", 2012.
- **Licence:** CC BY-SA 4.0. The page's footer: "©2020 Tanner Helland Text and
  images are CC BY-SA 4.0." The article gives no separate licence for its
  pseudocode, which is part of that text. skymap took the pseudocode's
  structure and its eight fitted constants (329.698727446 and the others).
- **Use:** Share-alike
- **Attribution:** CC BY-SA 4.0 asks for credit, a link to the licence, a note
  of changes, and that adaptations of the licensed material be shared under
  the same licence. The file names the author, the licence and the article.
- **Upstream:** <https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html>
- **Enters skymap:** written by hand from the article's formulae.
- **Modified:** Yes. Output converted from sRGB to linear light and normalised.
- **Checked:** 2026-10-07: <https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html>

### Mulberry32 (seeded random numbers)

<!-- attribution: id=mulberry32; hosts=gist.github.com -->

- **What:** The 32-bit generator in `src/utils/random/mulberry32.ts`, used
  wherever the app needs the same "random" numbers on every load.
- **By:** Tommy Ettinger, 2017.
- **Licence:** Public domain (CC0). The gist's header: "To the extent possible
  under law, the author has dedicated all copyright and related and
  neighboring rights to this software to the public domain worldwide. This
  software is distributed without any warranty. See
  <http://creativecommons.org/publicdomain/zero/1.0/>."
- **Use:** Free, no credit asked
- **Attribution:** None required; the file names the author and links the gist.
- **Upstream:** <https://gist.github.com/tommyettinger/46a874533244883189143505d203312c>
- **Enters skymap:** written by hand in TypeScript from the gist's C.
- **Modified:** Yes. Translated; returns a float in [0, 1).
- **Checked:** 2026-10-07: <https://gist.githubusercontent.com/tommyettinger/46a874533244883189143505d203312c/raw>

### ACES filmic tone-mapping fit (Krzysztof Narkowicz)

<!-- attribution: id=narkowicz-aces -->

- **What:** The five-constant curve `applyAces` in
  `src/services/gpu/shaders/lib/tonemap.wesl` and its CPU twin `acesFilmic`
  in `src/services/gpu/passes/compositor.ts`: one of the tone-mapping curves
  the app offers.
- **By:** Krzysztof Narkowicz, "ACES Filmic Tone Mapping Curve", 2016.
- **Licence:** The article, of the code: "Fitted curve’s HLSL source code
  (free to use under public domain CC0 or MIT license)".
- **Use:** Free, no credit asked
- **Attribution:** None required under CC0; the files name the author.
- **Upstream:** <https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/>
- **Enters skymap:** hand-ported from HLSL to WGSL and TypeScript.
- **Modified:** Translated; constants unchanged.
- **Checked:** 2026-10-07: <https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/>

### `pcg4d` hash (Jarzynski & Olano 2020)

<!-- attribution: id=pcg4d -->

- **What:** The four-lane integer hash `pcg4d` in
  `src/services/gpu/shaders/milkyWay/sprites/generate.wesl`, which the file
  says matches "the paper's reference GLSL exactly"; it seeds the drawn Milky
  Way's stars and clouds.
- **By:** Mark Jarzynski and Marc Olano, "Hash Functions for GPU Rendering",
  Journal of Computer Graphics Techniques 9(3), 2020.
- **Licence:** The paper, which prints the function as a listing: "The Authors
  provide this document (the Work) under the Creative Commons CC BY-ND 3.0
  license". No separate licence for the listing's code is stated in the
  paper. The paper's ShaderToy companion, where a licence for the code may be
  stated, could not be opened.
- **Use:** No derivatives; No licence stated
- **Attribution:** Cite the paper; the file does.
- **Upstream:** <https://jcgt.org/published/0009/03/02/>
- **Enters skymap:** hand-ported from the paper's listing to WGSL.
- **Modified:** Translated; the arithmetic is the listing's.
- **Checked:** 2026-10-07: <https://jcgt.org/published/0009/03/02/paper.pdf>
- **Not verified:** any licence stated with the authors' ShaderToy code
  (ShaderToy answered HTTP 403).

### Colour maps: viridis, magma, inferno and "coolwarm"

<!-- attribution: id=colormaps -->

- **What:** Colour ramps in `src/data/volume/scalarFieldPalettes.ts`. Five
  anchor colours each of `viridis`, `magma` and `inferno`, which the file
  says "match matplotlib's `_cm_listed.py`"; `inferno` colours the cosmic web
  glow. And a `coolwarm` ramp whose comment says its anchors are "borrowed
  from matplotlib's `coolwarm`".
- **By:** viridis, magma, inferno: Nathaniel J. Smith, Stéfan van der Walt and
  Eric Firing (the "mpl-colormaps"), shipped in matplotlib. matplotlib's
  `coolwarm` is, in its own source, "generated from CoolWarmFloat33.csv of
  'Diverging Color Maps for Scientific Visualization' by Kenneth Moreland".
- **Licence:** mpl-colormaps: CC0. "To the extent possible under law, the
  persons who associated CC0 with mpl-colormaps have waived all copyright and
  related or neighboring rights to mpl-colormaps." matplotlib itself: its own
  licence, which grants use and derivative works "provided, however, that
  MDT's License Agreement and MDT's notice of copyright, i.e., "Copyright (c)
  2012- Matplotlib Development Team; All Rights Reserved" are retained in
  matplotlib alone or in any derivative version". Kenneth Moreland's page
  states no licence for the colour table. skymap's `coolwarm` anchors are not
  matplotlib's numbers: matplotlib's table runs (59, 76, 192) → (221, 221,
  221) → (180, 4, 38), ours (20, 60, 180) → (245, 245, 240) → (180, 30, 30).
- **Use:** Free with credit; No licence stated
- **Attribution:** None required for the CC0 maps. For matplotlib's own
  material, the licence and notice quoted above.
- **Upstream:** <https://bids.github.io/colormap/>,
  <https://github.com/matplotlib/matplotlib>,
  <https://www.kennethmoreland.com/color-maps/>
- **Enters skymap:** typed by hand as anchor colours.
- **Modified:** Yes. Five anchors per map, interpolated; `coolwarm` re-chosen
  by eye and given an opacity per anchor.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/BIDS/colormap/master/LICENSE.txt>,
  <https://bids.github.io/colormap/>,
  <https://raw.githubusercontent.com/matplotlib/matplotlib/main/LICENSE/LICENSE>,
  <https://raw.githubusercontent.com/matplotlib/matplotlib/main/lib/matplotlib/_cm.py>,
  <https://www.kennethmoreland.com/color-maps/>

### Shader hashes whose origin is not recorded

<!-- attribution: id=shader-hashes -->

- **What:** `integerHash3` and `hashAvalanche` in
  `src/services/gpu/shaders/lib/util.wesl`, used by the noise bakes of the
  drawn Milky Way. The comment calls the first a "Bob Jenkins/Squirrel-family
  3-int avalanche" and names no source. Its three multipliers (374761393,
  668265263, 2246822519) are the numbers xxHash names `PRIME32_5`,
  `PRIME32_4` and `PRIME32_2`; the function is not xxHash.
- **By:** Not recorded.
- **Licence:** Not recorded: no source is named, so no licence could be read.
  xxHash, whose constants these are, is "BSD 2-Clause License", "Copyright (C)
  2012-2023 Yann Collet".
- **Use:** No licence stated
- **Attribution:** None recorded.
- **Upstream:** None recorded. <https://github.com/Cyan4973/xxHash> for the
  constants.
- **Enters skymap:** written by hand in WGSL.
- **Modified:** Not known.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/Cyan4973/xxHash/dev/xxhash.h>
- **Not verified:** where the function was taken from.

### DialKit's slider (design reimplemented)

<!-- attribution: id=dialkit -->

- **What:** `src/components/common/Slider/Slider.tsx`, which its header calls
  "a reimplementation of dialkit's Slider adapted to skymap's tokens". The
  package is not a dependency and, by the header, none of its animation code
  is used.
- **By:** Josh Puckett (dialkit).
- **Licence:** MIT, as GitHub reports for the repository and as the npm
  package's `license` field states. Its licence text was not read.
- **Use:** Free with credit
- **Attribution:** MIT asks that its notice travel with copies of the
  software; whether any of dialkit's code, as opposed to its design, is in the
  file was not established.
- **Upstream:** <https://github.com/joshpuckett/dialkit>
- **Enters skymap:** written by hand in React and CSS.
- **Modified:** A reimplementation.
- **Checked:** 2026-10-07: <https://api.github.com/repos/joshpuckett/dialkit>,
  <https://registry.npmjs.org/dialkit/latest>
- **Not verified:** the licence text and its copyright line; how much of the
  original's code the file follows.

### Atmospheres: Bruneton & Neyret 2008, Hillaire 2020

<!-- attribution: id=atmosphere-methods -->

- **What:** Methods only; no code is reused. The atmosphere shaders
  (`src/services/gpu/shaders/atmosphere/`) follow Bruneton's
  transmittance-table parametrisation and Hillaire's multiple-scattering
  approximation.
- **By:** Bruneton & Neyret 2008, "Precomputed Atmospheric Scattering",
  Computer Graphics Forum 27(4); Hillaire 2020, "A Scalable and Production
  Ready Sky and Atmosphere Rendering Technique", Computer Graphics Forum 39(4).
- **Licence:** None applies to a method; the papers are cited.
- **Use:** Reference only
- **Attribution:** Cite the two papers.
- **Upstream:** <https://github.com/ebruneton/precomputed_atmospheric_scattering>,
  <https://sebh.github.io/publications/egsr2020.pdf>
- **Enters skymap:** as a design, in our own WGSL.
- **Modified:** Not applicable.
- **Checked:** 2026-10-07: no page opened.
- **Not verified:** the licence of the reference implementations (not used).

### Black-hole lensing: Bruneton 2020

<!-- attribution: id=black-hole-method -->

- **What:** Method and comparison baseline only; no code is reused. The lens
  around Sagittarius A\* computes its own deflection table
  (`src/utils/lensing/buildSchwarzschildDeflectionLut.ts`) and its own march
  (`src/services/gpu/shaders/bodies/blackHoleLensing/`).
- **By:** Eric Bruneton, "Real-time High-Quality Rendering of Non-Rotating
  Black Holes", 2020 ([arXiv:2010.08735](https://arxiv.org/abs/2010.08735)).
- **Licence:** None applies to a method; the paper is cited.
- **Use:** Reference only
- **Attribution:** Cite the paper.
- **Upstream:** <https://github.com/ebruneton/black_hole_shader>
- **Enters skymap:** as a design, in our own WGSL.
- **Modified:** Not applicable.
- **Checked:** 2026-10-07: no page opened.
- **Not verified:** the licence of the reference implementation (not used).

## Hand-typed data

These files are written by hand in the repository. Their provenance, row by
row where it is known, is in [docs/DATA.md](docs/DATA.md), "Hand-typed values
and where they come from".

### Fact sheets of the solar-system bodies

<!-- attribution: id=seed-planet-facts; keys=planet-facts.seed -->

- **What:** Mass, gravity, day, year, distance, temperature, moons, tilt and
  atmosphere of 43 bodies, as display strings, with a paragraph each.
- **By:** Typed by hand by the project; no source is recorded per value.
- **Licence:** Ours (MIT), for the wording; the numbers are facts.
- **Use:** Ours (MIT)
- **Attribution:** None. The nine planet rows were compared with NASA's
  Planetary Fact Sheet today and agree but for the values listed in
  `docs/DATA.md`.
- **Upstream:** <https://nssdc.gsfc.nasa.gov/planetary/factsheet/> (the
  comparison, not a recorded source).
- **Enters skymap:** `data/seeds/planet_facts.seed.json` →
  `npm run build-planet-facts` → `src/data/bodies/bodyFacts.generated.ts`.
- **Modified:** Not applicable.
- **Checked:** 2026-10-07: <https://nssdc.gsfc.nasa.gov/planetary/factsheet/>,
  <https://nssdc.gsfc.nasa.gov/planetary/factsheet/planet_table_ratio.html>
- **Not verified:** the 34 rows of moons, spacecraft and other bodies.

### Featured clusters, superclusters, voids and groups

<!-- attribution: id=seed-structures; keys=structures.seed -->

- **What:** 42 hand-placed structures (15 clusters, 16 groups, 8
  superclusters, 3 voids): a position, a distance, two radii and a paragraph
  each. The voids and groups exist only here; no catalogue feeds them.
- **By:** Typed by hand by the project; no source is recorded per row.
- **Licence:** Ours (MIT).
- **Use:** Ours (MIT)
- **Attribution:** None.
- **Upstream:** None recorded.
- **Enters skymap:** `data/seeds/structure_anchors.seed.json` →
  `npm run build-structures` → `public/data/structure-catalog/`.
- **Modified:** Not applicable.
- **Checked:** 2026-10-07: the file itself; no outside page.
- **Not verified:** every position, distance and radius in it.

### Famous galaxies

<!-- attribution: id=seed-famous-galaxies; keys=famous.seed -->

- **What:** 81 well-known galaxies: names, position, distance, diameter, type
  and a description.
- **By:** Compiled by the project from HyperLEDA (names, position, distance
  modulus, diameter) and Wikipedia (about 50 descriptions); about 20
  descriptions are our own.
- **Licence:** As HyperLEDA and Wikipedia above; ours for the rest.
- **Use:** No licence stated; Share-alike
- **Attribution:** As HyperLEDA and Wikipedia above.
- **Upstream:** <http://atlas.obs-hp.fr/hyperleda/>, <https://en.wikipedia.org/>
- **Enters skymap:** `data/seeds/famous_galaxies.seed.json` →
  `npm run build-famous` → `famous.bin`, `famous_galaxies_meta.json`.
- **Modified:** Yes. Units converted; descriptions shortened.
- **Checked:** 2026-10-07: the pages under HyperLEDA and Wikipedia.

### Famous stars, the Sun and constellation overrides

<!-- attribution: id=seed-famous-stars; keys=famous-stars.seed,sun.seed,constellation-overrides.seed -->

- **What:** Well-known stars with their catalogue numbers, position,
  distance, magnitude, type, radius, temperature, mass and a description; the
  Sun in the same form; and star choices for constellation vertices the
  resolver could not place.
- **By:** Typed by hand by the project; no source is recorded per value.
- **Licence:** Ours (MIT), for the wording; the numbers are facts.
- **Use:** Ours (MIT)
- **Attribution:** None.
- **Upstream:** None recorded.
- **Enters skymap:** `data/seeds/famous_stars.seed.json`, `sun.seed.json` →
  `npm run build-famous-stars`; `constellation_overrides.seed.json` →
  `tools/stars-rs`.
- **Modified:** Not applicable.
- **Checked:** 2026-10-07: the files themselves; no outside page.
- **Not verified:** the values in them.

### Local-volume distances

<!-- attribution: id=seed-local-volume; keys=localvolume.distances -->

- **What:** Distances for a handful of nearby galaxies that neither
  Cosmicflows-4 nor our HyperLEDA cache covers.
- **By:** Typed by hand by the project. Each row's `method` field names where
  its distance comes from (for example "TRGB, Karachentsev+ 2003 (NED)").
- **Licence:** Ours (MIT); the numbers are published measurements.
- **Use:** Ours (MIT)
- **Attribution:** The source named in each row.
- **Upstream:** Per row; most were looked up in NED.
- **Enters skymap:** `data/seeds/local_volume_distances.seed.json` →
  `tools/catalog/catalogDistanceFor.ts`.
- **Modified:** Not applicable.
- **Checked:** 2026-10-07: the file itself; no outside page.
- **Not verified:** each row against its named source.

### skymap's own records and hosts

<!-- attribution: id=skymap-own; keys=textures.dir,textures.sha256,textures.readme,meshes.dir,meshes.sha256,meshes.readme; hosts=skymap-data.rulkens.com,skymap.rulkens.com,rulkens.com -->

- **What:** Checksum files, provenance READMEs and download folders of the
  registry that belong to no single source; and the project's own hosts: the
  app, the maker's site, and the R2 bucket from which the app fetches every
  built data file, texture, tile and model named in this file.
- **By:** Alexander Rulkens.
- **Licence:** MIT for what is ours; each file served from the bucket keeps
  the terms of its entry here.
- **Use:** Ours (MIT); Per item
- **Attribution:** As each entry states.
- **Upstream:** <https://github.com/rulkens/skymap>
- **Enters skymap:** `.env.production` (`VITE_DATA_BASE_URL`); `docs/DEPLOY.md`.
- **Modified:** Not applicable.
- **Checked:** 2026-10-07: the repository itself.

### Pictures and films made with skymap

<!-- attribution: id=skymap-pictures -->

- **What:** Every render of the app that is published: the website's stills
  (76 rows in `packages/website/src/data/siteShots.ts`, files under
  `packages/website/src/assets/shots/`), its nine film loops
  (`assets/loops/place-*.mp4`), the stills of the home page's flight
  (`assets/flight/`), the two social cards (`assets/og-card.jpg`,
  `public/og-image.jpg`), the 47 card thumbnails the app ships
  (`public/images/featured/`), and any screenshot or recording a visitor
  takes.
- **By:** Alexander Rulkens, for the render. Each picture is also a copy or
  an adaptation of whatever third-party data and imagery is in the frame.
- **Licence:** Ours (MIT) for our part only. A picture carries the terms of
  every entry of this file that is visible in it, and the most restrictive of
  them governs its reuse:
  - Any frame with stars: Gaia DR3, "CC BY-NC 3.0 IGO" (non-commercial), and
    ESA: "Prior to any commercial use by the User of any Data or Data
    Product, including any use or application that directly or indirectly
    generates a financial gain, a detailed request for authorisation/licence
    shall be made". The brightest stars are Hipparcos rows, whose catalogue
    states no licence.
  - Galaxy and quasar points: SDSS (public domain, as SDSS states), DESI (CC
    BY 4.0), and 2MRS, Cosmicflows-4 distances, GLADE, Milliquas and
    HyperLEDA (no licence stated; of the copies taken from CDS, CDS says
    "The commercial usage of the data is subject to rules depending of the
    origin").
  - The cosmic web glow: an SDSS DR17 product (see entry: mcpm-vac).
    Structure markers: MCXC and MSCC (no licence stated; taken from CDS,
    under the same sentence).
  - Planets and moons: per map, as "Solar-system textures" lists; the maps of
    the moons of Uranus state no licence.
  - Earth close up: EOxCloudless 2025, CC BY-NC-SA 4.0 (non-commercial,
    adaptations under the same licence), used by permission; GeoDanmark and
    Klimadatastyrelsen data, CC BY 4.0.
  - A galaxy's photograph: per image, as "Galaxy imagery" lists. One site
    still, `guide-card-galaxy`, shows a Digitized Sky Survey cutout:
    copyrighted, and "Commercial, for-profit use of the copyrighted
    collections is prohibited without written permission from the copyright
    holder(s)."
  - 3D models: per model, as "3D models" lists.
  No picture that shows stars, 2MRS, GLADE or Milliquas points can therefore
  be offered for unrestricted reuse, and the website offers none.
- **Use:** Per item; Non-commercial only
- **Attribution:** "skymap / Alexander Rulkens", followed by the credit of
  each source in the frame as its entry words it.
- **Upstream:** the app itself; `tools/site/README.md`, `tools/capture/README.md`.
- **Enters skymap:** `npm run site:shots`, `npm run site:media`,
  `npm run capture-featured`.
- **Modified:** Not applicable.
- **Checked:** 2026-10-07: the entries of this file named above, on the pages
  they list; no page of its own.
- **Not verified:** frame by frame, which sources are visible in each of the
  76 stills, 9 loops and 47 thumbnails; 28 stills carry a credit line, the
  loops, flight stills and thumbnails carry none.

## Services and links

### NED, the NASA/IPAC Extragalactic Database (link only)

<!-- attribution: id=ned; hosts=ned.ipac.caltech.edu -->

- **What:** The cards of galaxies link to NED's page for the object. Nothing
  is fetched from NED by the app; some hand-typed distances were looked up
  there.
- **By:** NASA/IPAC, Caltech.
- **Licence:** Not read; no NED data is shipped as such.
- **Use:** Reference only
- **Attribution:** None for a link.
- **Upstream:** <https://ned.ipac.caltech.edu/>
- **Enters skymap:** `src/utils/math/nedByNameUrl.ts`, `nedNearPositionUrl.ts`.
- **Modified:** Not applicable.
- **Checked:** 2026-10-07: no page opened.
- **Not verified:** NED's terms and the acknowledgement it asks for.

### Counterscale (visit counter)

<!-- attribution: id=counterscale; hosts=counterscale.rulkens.workers.dev -->

- **What:** The script that counts visits, run on our own Cloudflare account.
- **By:** Ben Vinegar and contributors.
- **Licence:** MIT. "Copyright 2025 Ben Vinegar".
- **Use:** Free with credit
- **Attribution:** The MIT notice with copies of the software; we serve its
  tracker script unchanged from our deployment.
- **Upstream:** <https://github.com/benvinegar/counterscale>
- **Enters skymap:** `.env.production` (`VITE_COUNTERSCALE_URL`) →
  `src/utils/analytics/injectAnalytics.ts`.
- **Modified:** No.
- **Checked:** 2026-10-07: <https://raw.githubusercontent.com/benvinegar/counterscale/main/LICENSE>

### Cloudflare Turnstile (contact form check)

<!-- attribution: id=turnstile; hosts=challenges.cloudflare.com -->

- **What:** The spam check of the website's contact form; the Worker asks
  Cloudflare to verify a token. The form is closed until it is configured.
- **By:** Cloudflare.
- **Licence:** A service under Cloudflare's terms, not read here.
- **Use:** Reference only
- **Attribution:** None.
- **Upstream:** <https://challenges.cloudflare.com/turnstile/v0/siteverify>
- **Enters skymap:** `src/data/worker/contactConfig.ts`,
  `src/utils/worker/verifyTurnstile.ts`.
- **Modified:** Not applicable.
- **Checked:** 2026-10-07: no page opened.
- **Not verified:** Cloudflare's terms.

### Links to papers, repositories and reference pages

<!-- attribution: id=outbound-links; hosts=arxiv.org,doi.org,github.com,caniuse.com,opensource.org -->

- **What:** Plain links in the app's exhibits, credits and page head: papers
  on arXiv and by DOI, repositories on GitHub, the WebGPU support table, the
  MIT licence text. Nothing is fetched from them.
- **By:** Their respective owners.
- **Licence:** None applies to a link.
- **Use:** Reference only
- **Attribution:** None.
- **Upstream:** the links themselves.
- **Enters skymap:** `src/data/exhibits/*.ts`, `src/components/Splash/`,
  `src/unsupportedPage.ts`, `index.html`.
- **Modified:** Not applicable.
- **Checked:** 2026-10-07: no page opened.

### npm dependencies

<!-- attribution: id=npm-dependencies -->

- **What:** The libraries the app and the website bundle. Named in
  `package.json`: `react`, `react-dom`, `react-redux`, `@reduxjs/toolkit`,
  `redux-saga`, `typed-redux-saga`, `react-markdown`, `classnames`,
  `hotkeys-js`, `meshoptimizer`, `wgpu-matrix`; for the website `astro`,
  `@astrojs/mdx`, `pagefind`. The bundles also hold what those pull in
  (`immer`, `redux`, `reselect`, `scheduler`, the `unified` and `micromark`
  families under `react-markdown`, and others); the build lists every one in
  `third-party-licenses.md`. Build-time tools are listed in `package.json`.
- **By:** Their authors.
- **Licence:** MIT, each of the fourteen named, as its own `package.json`
  states. Of the 74 packages the app's bundle holds, the build reports MIT
  for 71, ISC for one, and no licence field for two entry points of
  `redux-saga` (itself MIT).
- **Use:** Free with credit
- **Attribution:** MIT asks that "The above copyright notice and this
  permission notice shall be included in all copies or substantial portions
  of the Software." The app's bundle itself carries no licence notice (the
  build strips comments), so the app's build writes them to one file beside
  it, `third-party-licenses.md` (Vite's `build.license`): the licence text of
  each of the 74 packages in the app's bundle, all MIT but one ISC
  (`@ungap/structured-clone`). The website's build and the three dev-tool
  pages (`/galaxy/`, `/mcpm/`, `/flow/`) write no such file.
- **Upstream:** <https://www.npmjs.com/>
- **Enters skymap:** `package.json`, `packages/website/package.json`.
- **Modified:** No.
- **Checked:** 2026-10-07: the `license` field of each of the fourteen
  installed packages; the built bundle, searched for licence notices; the
  generated `third-party-licenses.md`.
- **Not verified:** what the website's scripts and the dev-tool pages bundle.
