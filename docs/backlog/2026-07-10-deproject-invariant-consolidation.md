# Deproject square-in/square-out invariant — consolidation candidate

Surfaced during the 2026-07-10 test-suite over-testing audit. The curator's
square-in/square-out deproject invariant (a square crop stays square through
the deproject transform) is asserted in **four** separate test files, each
from a thin unique angle:

- curator `export.deproject`
- curator `export.registration`
- `routes/export` deproject-square
- curator `process.deproject`

None is a straight DUPLICATE — each pins the invariant at a different layer of
the export surface, so the audit **kept all four** rather than cutting three.
The redundancy is latent, not active friction: the four only drift into
conflict if the deproject maths changes, at which point four files must move
together.

Consolidation candidate — **not** a standalone task: if the curator export
surface is ever reworked, collapse the four into **one parameterized test**
that runs the same square-in/square-out assertion across each entry point
(export / registration / route / process), so the invariant has a single home
and a maths change touches one file. Until that rework happens, leave the four
in place — splitting them out now would be churn without payoff.
