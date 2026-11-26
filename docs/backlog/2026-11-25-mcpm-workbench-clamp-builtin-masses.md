# Clamp built-in catalog masses in the MCPM workbench

**Surfaced:** 2026-11-25 (owner ruled: do not clamp in the load-catalog branch). **Readiness:** ready.

The workbench feeds the built-in catalogs' stellar masses to the simulation unclamped. A few rows
are impossible: SDSS spans 1e-11 to 1e15 Msun. At the medium tier, 149 SDSS, 248 GLADE and 6 2MRS
rows fall outside 1e8 to 10^12.5 Msun, and one 1e15 galaxy outweighs thousands of ordinary ones.

**Proposal.** Clamp to 1e8 to 10^12.5 Msun on load, as the Polyphorm port's 2MRS input did.
