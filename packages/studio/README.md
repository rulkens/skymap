# studio

The clip studio: a timeline editor for registry clips. It opens any clip in `APP_CLIP_REGISTRY`, shows
its structure and the compiler's timing as an outline beside tracks, and edits step parameters with
undo, and previews the clip in the 3D view at the playhead: scrubbing seeks camera and scene,
Play/Pause/Loop run it (S4). It does not save yet; the plan and its later slices are in
`docs/superpowers/plans/completed/2026-11-10-clip-studio-package.md`, the decisions in
`docs/grill-sessions/clip-studio-2026-11-07.md`.

## Opening it

`#studio=<clipId>`, e.g. `http://localhost:5173/#studio=cosmicFlows`. The studio is a takeover
beside `exhibit`, `tour` and `clip`: a tour or exhibit link replaces it, Close or Escape (with
nothing selected) ends it, and the sim clock stays frozen while it is open. The draft lives in
memory only; it survives Close and reopening the same clip, not a reload.

## How it builds

No build of its own. The app's Vite build emits the package as a lazy chunk, and the root configs
compile, lint and test it (`tsconfig.json`, `vitest.config.ts`, `eslint.config.js`). Tests mirror
`src/` under `tests/`; component tests opt into jsdom per file.

## Module map

Concern modules first, role folders inside (ADR 0014's shape):

```
src/
  studioEntry.ts   the chunk's only entry: StudioDockContainer + studioSessionSaga
  @types/          cross-module contract types (session/, rows/, kinds/), one per .d.ts
  data/            cross-module data (channel families)
  utils/format/    naming-table formatters
  draft/utils/     pure addressing and edits over the authored ClipData tree
  session/         the studio slice (injected), its selectors and the session sagas; previewSaga is
                   the one writer of camera.clip while the studio is open
  kinds/data/      the row-kind registry: one entry per Effect kind, plus start and waypoint
  timeline/        the derived timeline model, its selectors, outline/ruler/track components
  primitives/      glyphs, tooltip, key chip, inspector grid
  inspector/       field controls and the inspector panel
  shell/           dock, top bar, transport controls, key bar, key table
  containers/      the store wiring, by concern: each <Name>Container selects and dispatches for <Name>
```

## Boundary

The app knows the package only by two dynamic `import()`s of `studioEntry.ts`:
`src/state/studio/studioBodySaga.ts` (the takeover body) and `src/components/StudioHost/StudioHost.tsx`
(the React host). The package deep-imports app types, engine and store modules by relative path;
those live in the main chunk, so the lazy chunk depends on main and never the reverse.

Its state is a slice injected into the app's root reducer when the chunk loads (ADR 0017): the
selectors module calls `injectInto`, and every read goes through those selectors, since the app's
`RootState` does not know the slice.
Only `containers/` reads the store, through `src/store/hooks.ts`, never `react-redux`; components
take props (`tests/conventions/storeBoundary.test.ts`). Nothing imports the design mocks under
`src/dev/`. `tests/conventions/studioImportBoundary.test.ts` enforces the rest.
