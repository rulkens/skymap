# refactor-ground: skymap notes

Read by the shared `refactor-ground` skill (it lives in the bluecode repo and is linked into each account's
skills folder) before its pass.

- **Where data shapes live.** Registries, type unions, the .bin formats and the store shapes. Growth usually
  starts as a row: a new source is a `SOURCE_REGISTRY` row first, and its store, renderer and UI shape follow from
  what kind of row it is.
- **What a wrong shape costs.** It propagates into the .bin format, the stores and the shaders. Price a break as
  migration, a re-bake, a cache-skew window and any external readers.
- **Adjacent findings.** A `docs/backlog/` detail file by default.
- **Standing rulings.** PR packaging (prep as separate PR(s) or everything on one PR) is asked at every checkpoint;
  there is no default (`feedback_prep_rides_same_pr_ask`). Genuine decision branches go to a `grill-me` session.
  Bolt-on smells here include another hand-added term in a wake predicate or watcher list.
- **History.** The skill's decision ledger is `docs/grill-sessions/refactor-ground-skill-2026-07-14.md`.
