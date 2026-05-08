# 0007 — Accept CF-4's CC BY-NC license for v1, document the constraint loudly

**Status:** Accepted (proposed by the cosmic-zoom plan author; awaiting team review)
**Date:** 2026-05-08
**Deciders:** the cosmic-zoom plan author (proposed); awaiting review by @rulkens

## Context

Almost every dataset the cosmic zoom needs is either public domain or CC BY 4.0
(attribution required, commercial use OK). The exhaustive table lives in
[`../data/00-data-sources.md`](../data/00-data-sources.md). Eight of the nine
new sources are uncomplicated — JPL Horizons, Gaia DR3, NED Local Volume
Catalog, Tully galaxy groups, Abell/ACO/MCXC clusters, ROSAT, Planck, and the
Milky Way model assets all permit redistribution and commercial use under
attribution-only terms that fit cleanly into a `CREDITS.md` file at the repo
root.

The exception, and the entire reason this ADR exists, is **Cosmicflows-4**.
Tully et al. 2023 and the Valade et al. 2024 HAMLET reconstructions that
derive from it are published under **CC BY-NC 4.0** — Attribution-NonCommercial
4.0 International. Full constraint analysis sits in
[`../data/07-cosmicflows.md`](../data/07-cosmicflows.md), section "Licensing &
attribution"; the short version is that CC BY-NC permits any non-commercial
use with attribution and prohibits any use where money flows toward the
publisher because of the data. CC BY-NC has no carve-out for "small projects"
or "good intentions" — the boundary is "commercial vs not."

CF-4 is not optional content. It is the sole hero asset of Shell 7
(Laniakea), which is itself the rhetorical climax of the entire tour: the
moment the user sees the gravitational basin we live inside. There is no
public-domain or CC BY substitute at comparable depth as of 2026 — BORG-SDSS
is also BY-NC, 2M++ has mixed per-derivative licensing, and the Hoffman
constrained simulations are case-by-case. This is a structural constraint of
the field, not a temporary gap.

Skymap today is a personal, non-commercial project. It has no paid tier, no
ads, no sponsorships, no affiliate links, no merchandise, no SaaS embedding.
It runs on the author's own Cloudflare account at zero user-facing cost. By
any reasonable reading of CC BY-NC's "non-commercial" boundary, skymap is
inside it.

The question this ADR answers: **do we accept the CC BY-NC license now and
build Shell 7 on CF-4, knowing a future commercial pivot would force us to
rip it out?**

## Decision

We **accept CC BY-NC for v1** and ship Shell 7 with the CF-4 catalog,
density volume, and flow field as designed. The constraint is documented in
three independent surfaces so a future maintainer cannot miss it:

1. **In-app credit on Shell 7** carries the literal text "Reconstruction:
   Valade et al. 2024 • Catalog: Tully et al. 2023 — CC BY-NC" for the
   duration of the beat. The "About this view" panel expands to the full
   citation block.
2. **Repo-level `CREDITS.md`** lists every dataset, version, citation, and
   license, with CF-4 marked as the sole CC BY-NC entry.
3. **Repo-level `LICENSE-DATA.md`** mirrors the per-source license table and
   includes the verbatim CC BY-NC monetization-trigger checklist from
   [`../data/07-cosmicflows.md`](../data/07-cosmicflows.md).

We additionally add a **monetization gate**: any change to skymap that
introduces a paid tier, sponsorship, ad placement, sold derivative, or
inclusion in a commercial product *must* re-open this ADR before merging.
The gate is enforceable by social convention; we do not attempt CI
enforcement (a regex over commit messages would be more theatre than
defense).

## Alternatives considered

**(a) Avoid CF-4 entirely.** Drop Shell 7's hero visual; use GLADE + 2MRS
points alone with a static Laniakea boundary overlay drawn from the original
Tully 2014 paper. Pros: no licensing constraint, full commercial freedom,
simpler R2 footprint (~150 MB saved). Cons: Shell 7 loses its punch — the
density volume and flow vectors *are* the climax; without them Shell 7
becomes "the same point cloud as Shell 8 with fewer points," which makes the
narrative arc collapse. The tour's emotional payoff is sacrificed to preserve
optionality skymap has not yet exercised. **Rejected** — the cost is paid up
front against a benefit that is hypothetical.

**(b) Negotiate a commercial license directly with the Cosmicflows team at
IfA Hawaii.** Pros: removes the constraint cleanly. Cons: the CF team is an
academic group with no commercial-licensing infrastructure; historical
correspondence has been responsive but informal. Even an enthusiastic
"sure, go ahead" would not be legally sufficient against the published CC
BY-NC notice — we would need a signed bilateral agreement, which neither
party has the appetite to draft for a non-commercial visualization.
**Rejected** — impractical relative to the actual current need.

**(c) Accept CC BY-NC and document.** Chosen. Matches the project's actual
status, ships the best version of Shell 7, and preserves the exit ramp via
documentation rather than legal infrastructure.

**(d) Use Option B downsampling (128³ instead of 256³) to make the eventual
rip-out cheaper.** Orthogonal to the license question — the file size
shrinks but the constraint does not. Decided separately in
[`0008-build-pipeline.md`](0008-build-pipeline.md).

## Consequences

**Positive:**
- Shell 7 ships with its hero visual intact; the tour's emotional arc lands.
- The constraint is visible in three places (overlay, CREDITS.md,
  LICENSE-DATA.md), so a future maintainer auditing for a monetization pivot
  will trip over it immediately.
- Skymap remains a personal portfolio project with no licensing burden in
  its current form.

**Negative:**
- **Skymap inherits a non-commercial obligation.** As long as Shell 7 ships
  CF-4, the entire project is effectively constrained — CC BY-NC's
  no-sublicensing clause means a single BY-NC dataset pulls the whole
  bundle down to BY-NC for users who consume the visualization. We cannot
  add a paid tier without first removing CF-4.
- **A future monetization pivot is structurally expensive.** The cleanest
  exit is alternative (a) — drop Shell 7's hero visual and ship a
  point-cloud fallback. That exit is cheap to *plan* (the fallback is
  already specified) but expensive to *experience* — the tour loses its
  climax. Future-us must accept either the licensing constraint or the
  visual downgrade; there is no third path as of 2026.
- **A reviewer must stay vigilant.** The monetization gate is social, not
  technical. If skymap quietly adds an "optional patron tier" or a
  Buy-Me-a-Coffee link adjacent to Shell 7, the question of whether that
  crosses CC BY-NC's "non-commercial" line will surface — and answers vary
  by jurisdiction.

**Operational:**
- `tools/buildCosmicflows.ts` snapshots the upstream CC BY-NC license text
  into `data/raw/cf4/LICENSE.txt` at acquisition time, so the license
  version we shipped against is frozen at build time even if the upstream
  text drifts.
- The R2 sync script's ALLOW filter for `cf4-*.bin` files is a structural
  marker of the dependency — removing those entries is the technical step
  of a license-driven rip-out.

## References

- [`../data/00-data-sources.md`](../data/00-data-sources.md) — master
  dataset table, licensing summary section.
- [`../data/07-cosmicflows.md`](../data/07-cosmicflows.md) — full CF-4
  acquisition spec including the verbatim monetization-trigger checklist.
- [`0008-build-pipeline.md`](0008-build-pipeline.md) — how the CF-4 binaries
  reach the user (relevant to "what does removal cost").
- [`0009-existing-plan-coordination.md`](0009-existing-plan-coordination.md)
  — sequencing relative to the existing CF-4 dark-matter volume render
  spec.
- Creative Commons CC BY-NC 4.0 deed:
  <https://creativecommons.org/licenses/by-nc/4.0/>
- Tully, R. B., et al. (2023). *Cosmicflows-4.* ApJ, 944, 94.
- Valade, A., et al. (2024). *Cosmography of the Local Universe by HMC
  Reconstruction.* Nature Astronomy, 8, 1610.
