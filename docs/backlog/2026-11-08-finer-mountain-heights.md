# Finer terrain heights for the Alps and Andes

`needs-design` — Earth's terrain mesh uses ETOPO heights with posts about 2.4 km apart, so the
antique look's mountain engraving (commits f3b784a27 to d218aca51, kept by the owner 2026-11-08)
prints the Alps and Andes as faceted slabs instead of ridges and valleys.

Proposal: a roughly 1 arc-second (about 30 m) DEM for selected mountain regions, baked into the
existing surface tile archives. Candidate sources: Copernicus GLO-30, SRTM 1 arc-second, NASADEM.
Check each licence and attribution terms before choosing.

What it needs: a data-pipeline job (read `docs/DATA.md` for where it fits), a large download, and
an R2 sync of the rebuilt archives.

Reference shots (local only, gitignored): `data/shots/lookbench/mtn-r9/mtn-alps-sheet.png` and
`mtn-andes-sheet.png`.
