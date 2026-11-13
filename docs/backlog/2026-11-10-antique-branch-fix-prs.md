# Fix PRs split from the antique branch

The antique branch (`worktree-antique-map-spike`) carries generic fixes that belong on main. They land as their own small PRs so the branch shrinks. Source: the bugfix audit of 291 commits ahead of main (HEAD a59dd7e10, 2026-11-10).

When one lands, mark it merged here. When the antique branch merges main, those commits drop out of its diff. Items 1-7 are merged; delete this file once item 8 is too.

| # | PR | Bug on main | Source commits | Status |
| - | -- | ----------- | -------------- | ------ |
| 1 | Pose links: a craft is no body frame | A cold `#pose=b,hubble` link enters the body arm, the host never resolves, `hostOrThrow` throws every frame | 284bfa33f | MERGED #1107 |
| 2 | Boot camera base at link `t=` | A focus link's yaw/pitch drifted per load (base pose built from `Date.now()`) | f5512b39a | MERGED #1106 |
| 3 | Moon link frames the host-facing side | `focus=body-moon` opened on the far side at new moon | 42c49ed11 | MERGED #1112 |
| 4 | Surface-tile crossfade keeps the loop awake | Frame froze and settled half-blended after a tile landed (render-wake landmine, check RENDERER.md) | daa61d0ba | MERGED #1111 |
| 5 | Famous stars absMag re-derived | 12 stars drawn too faint or bright (Rigel -0.73 vs V 0.13); rerun the generator on main | 227b8caf7 | MERGED #1104 (R2 already serves the new meta, verified 2026-11-11) |
| 6 | Shot tool reliability | `--hide-labels` misses blackHoles and missions; HMR reloads break shots; a shot hung nine hours on a wedged GPU process | 1eeb1faab, b9b52fc18, 891d41f4c | MERGED #1105 + #1108 + #1109 |
| 7 | Jupiter GRS at its real longitude by date | Fixed Cassini map drifts ~118 deg/yr from the real spot; moves Jupiter at J2000, needs an owner look | c8de9becc, 49fb0a0a5 | MERGED #1113 |
| 8 | CSS-px / devicePixelRatio consistency | At dpr 2 label sizes and marker/leader/constellation/filament/ring/trail line widths shrink to half | labels: 64afa7984, e69ee9011; lines: 01dc2feee, a579ecdae, 7b4f5bd78, 9d775e45c, fe2a4a3cf, 7fc6d5754, 272fa80b2 | Not started: DPR labels + line widths, needs antique hunks stripped, split in two PRs, dpr-2 shot check |

## Caveat

The audit read subjects, stats and the hunks of each candidate, not every line of the big shared-file hunks in antique commits (`label2DDirector.ts`, `Panel.module.css`). Check those when cutting PR 8.

## Almost-fixes: maybe later, not bugs

- 020271707 STYLIZE frame section, b20ee4c70 and 3ea5c4e6e projection pair (dome prep refactors).
- ae45d06c4 starCatalog `leafRecord.wesl` extracted (antique-driven refactor).
- 0fd8e8a6c createTitleGrowth ramp type moved to `@types` (convention).
- 10eb733fc IM Fell TTFs to `data/raw/fonts` (asset hygiene).
- a4e537775 perf `--gate` knob, 6b45b7fcb lookbench, c9dbe6577 lookbench sgra view (antique tooling).
- 553820ffd texture-array files restored after a stale-tree revert.
- d8d52b1ac cube view only for fixed 6-layer rows, volumeFieldRenderer `steadyJitter`: antique-exposed, not main bugs.
- 4f36bc19b view covers report panel rects: feature groundwork, skip.
