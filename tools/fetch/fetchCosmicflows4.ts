#!/usr/bin/env node
/**
 * fetchCosmicflows4 — download the Cosmicflows-4 homogenised distance
 * table from CDS Vizier (J/ApJ/944/94, Tully+ 2023) to data/raw/cf4/.
 *
 * The fetch is one URL but the file is ~100 MB; we use Range: requests
 * to resume on restart so a network blip doesn't restart from zero.
 *
 * Source layout (confirmed against the CDS ReadMe):
 *   table2.dat — fixed-width ASCII, ~55,877 rows
 *   ReadMe     — column-offset spec (download alongside so the parser
 *                can validate the byte ranges it assumes)
 *
 * See data/raw/cf4/README.md for the in-repo provenance header.
 */
export const CF4_TABLE_URL =
  'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table2.dat';
export const CF4_README_URL =
  'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ReadMe';
