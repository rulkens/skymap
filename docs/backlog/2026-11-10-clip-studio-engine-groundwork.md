# Clip studio engine groundwork

Slice 1 of the clip studio (`packages/studio/`, `#studio=<clipId>`) shows a clip as an editable timeline with an
inspector, on a frozen clock. The 3D view does not follow the playhead yet, and nothing saves. Each slice below is
its own plan; decisions Q1–Q39 are in `docs/grill-sessions/clip-studio-2026-11-07.md`.

| Slice | Content | Why it is separate |
| --- | --- | --- |
| S2 Structure edits | Add from a palette, delete, duplicate, wrap/unwrap (seq/all), reorder (keys + drag), multi-select rows (shift/⌘-click) for those edits, edge-drag `over` (right edge only; a left edge in a Sequence is unruled), blend-overlap drag, join objects and the crossfade treatment (Q14, T1 ruled as Q32) | Pure reducers over the draft; drag affordances, no engine |
| S3 Scene as pure tracks (Q1, Q2) | Planned → [`plans/2026-11-10-clip-studio-s3-scene-tracks.md`](../superpowers/plans/2026-11-10-clip-studio-s3-scene-tracks.md) (spec beside it in `specs/`) | Engine change with app-wide reach; scrubbing is only truthful after it |
| S4 Seek and transport | `clipPlayer` pause/seek, the studio drives the preview from the playhead, Play/Pause/Loop, after-end frame, "Use current view" on camera steps (Q6, Q23), Play on the narrow notice | Needs S3; first slice where the 3D view follows the timeline |
| S5 Path overlay | The clip-path inspector's route, look-at line and frustum at the playhead, fed by the studio's resolved draft; Fly tuning in the inspector; the composite speed-curve lane (Q19) and knot drags (Q18) | Reuses `computeClipPath`; needs evaluation at the playhead (S4) |
| S6 PiP view rig (Q21) | A third view rig: edit camera main view plus an inset camera into its own texture and a composite pass; per-view scale-band fades, LOD, data demand, body slabs; `views` state, swap | Engine groundwork on the view-rig seam (`src/data/rendering/viewRigs.ts`), priced with `npm run perf` |
| S7 Detached window (Q24, Q25) | Either view into a popup whose canvas is configured on the main device | Spike first: cross-window canvas context, rAF throttling when hidden |
| S8 Save to TS (Q4, Q5, Q11) | `ClipData` → `effectHelpers` source codegen with `@generated` header, dev-server write endpoint, in-place overwrite of hand-written clips with the one-time inline note, save status states, reopen by evaluation | Dev-only file writes; needs the round-trip proven on every registry clip |

Slice 1 leftovers to fold into S2: error chips have no action; the inspector head glyph is not tinted by family
(`InspectorHead` has no family prop); the `--ch-*` channel hues live in `StudioDock.module.css`, not `tokens.css`.
