# Earth's noon sky renders dark navy at ground level

`needs-design` — standing in Søndermarken (55.67° N, 12.52° E) on 2026-11-03 at 10:55 UTC, with
the Sun about 19° up, the sky reads dark navy with stars showing, at both 1.7 m (the sky rung,
`#pose=k,…`) and 46 m (the existing `SONDERMARKEN_POSE` body pose). A daylit blue sky is
expected. The night sky at 21:00 UTC is right.

Repro links (this worktree's port aside):

- `#pose=k,earth,0.21859354349348772,0.9716130157244841,3.141592653589793,1.0471975511965976&t=2026-11-03T10:55:00Z`
  (south, 60° up)
- `#pose=k,earth,0.21859354349348772,0.9716130157244841,0,0&t=2026-11-03T10:55:00Z` (north, horizon)

Shots from the sky-rung eye checks are in the plan ledger,
`docs/superpowers/plans/completed/2026-11-03-sky-rung.ledger.md`.

Not yet diagnosed: whether the sky-view LUT (`shaders/atmosphere/skyViewLut.wesl`) or the
exposure/tonemap at ground level is the cause. Read `docs/RENDERER.md` first. The grand tour's
noon-to-night opening needs a daylit noon; ruled backlog, not the tour PR (2026-11-04).
