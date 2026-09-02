# Star picking — deferred behavioural edge

Adjudicated during PR #448's T17 sweep (final review + fix wave, 2026-07-18):
real, narrow, not worth blocking the feature. Evidence and disposition in the
PR's review trail.

## `star-<n>` deep link waits forever when the Gaia catalog is disabled

`watchFocusTweenSaga`'s star arm defers focus until the star catalog reports
loaded (`engineSourceCountReported`), which is correct at boot — but a user
who has TURNED OFF the Gaia source in settings and then opens a `#focus=star-<n>`
URL waits forever: the catalog never loads, the saga never proceeds, no
feedback. Options: (a) time out + toast; (b) auto-enable the source for the
deep link (matches the "deep link expresses intent" reading); (c) resolve the
row from the .skst directly without the GPU catalog. (b) is probably the
honest one — a star deep link IS a request to see that star.
