# Famous-curator suite runtime cost

Surfaced during the 2026-07-10 test-suite over-testing audit as an
**execution-cost** finding, explicitly _not_ over-testing: the
famous-curator tests are behavioral and stay. The problem is wall-clock,
not friction — several of them spin up **real `sharp` encode/decode plus
tmpdir I/O** per test (curator image processing, WebP round-trips), and
that handful of files dominates the suite's runtime while the other
~640 files are near-instant. The audit baseline (4,143 tests) ran green
in ~20.6 s; a disproportionate share of that is these encodes.

This is real coverage of a real pipeline (`tools/famous/famousImageProcessor`
and the curator export/registration/process surface), so the fix is to make
the _same_ assertions cheaper, never to delete them.

Candidate fixes (pick when the suite runtime becomes a felt cost):

- **Shared fixture cache.** Encode the test images once per run (module-scoped
  fixture / `beforeAll`) and reuse the buffers across tests instead of
  re-encoding per `it`.
- **Smaller test images.** Drop the fixture dimensions to the minimum the
  assertions actually exercise — most only check that a code path ran and a
  format/size came out, not pixel content.
- **Tagged slow-suite split.** Move the genuinely heavy encode tests behind a
  vitest tag / project so `npm test` stays fast and CI runs the slow set
  separately.

No design decision needed yet — measure which files actually cost the seconds
(`vitest --reporter=verbose` timings) before choosing among the three.
