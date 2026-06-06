# ADR 0006: Volume Field Settings Live in the Settings Layer

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Alexander Rulkens
- **Tags:** engine, settings, data-model, rendering, architecture
- **Supersedes (in part):** [ADR 0005](0005-engine-data-layer-and-asset-loading.md) — the `volumeStore` per-field-settings decision (§1 and the "volume field settings → volumeStore" consequence)
- **Related:** [`docs/superpowers/conventions/simplicity.md`](../superpowers/conventions/simplicity.md); forthcoming spec `docs/superpowers/specs/2026-06-06-volume-settings-unification-design.md`

## Context

ADR 0005 introduced per-type data stores under
`EngineState.data.{ galaxies, structures, filaments, volumes }`, each "the
authoritative app-side home" for its type. For galaxies and structures that store
holds real catalog data the CPU queries. For volumes the store is "thin": its
entire payload is the per-field *settings* — `enabled`, `intensity`, `contrast`,
`densityScale`, `paletteId`, `trim`, `exposure` — plus the set of registered field
ids. The voxels live on the GPU.

Those per-field values are not data. They are **settings** — user-tunable knobs
surfaced in the SettingsPanel. And the project already has a settings architecture
with a deliberate single-source-of-truth shape:

- `state.settings.<cluster>` is the one home for "every value the SettingsPanel
  surfaces" (`EngineSettingsState`). The renderer reads it per frame; React is an echo.
- Static scalar leaves flow through one declarative write path, `SETTINGS_TABLE`.
  Keyed settings (`labelCategoryVisibility`, `markerCategoryVisibility`) use a
  copy-on-write setter that writes `state.settings` and echoes a snapshot.

Volume per-field settings bypass all of it. They live in the **data** layer
(`state.data.volumes`); they are written by bespoke setters
(`engine.ts` `setVolumeFieldContrast` …) that **double-write** the store *and* the
renderer's per-field `FieldEntry` mirror; and they are read back into the panel by a
snapshot (`buildVolumeFieldsSnapshot`) that sources field *identity* from the GPU
renderer (`listHandles()`) and *values* from the store. Meanwhile the global gate
`volumes.masterEnabled` *does* live in `state.settings.volumes` and *does* flow
through the table — so one feature's settings are split across two subsystems.

The net effect: a single value such as a field's `contrast` lives in two persistent
homes (the data store and the renderer mirror), kept equal only by hand across seven
setters plus the boot and slot-commit replays, with a third derived React copy and a
split identity source. This is exactly the value-vs-place and single-source-of-truth
complecting named in [`simplicity.md`](../superpowers/conventions/simplicity.md), and
it exists because ADR 0005 filed user-facing settings under "data."

ADR 0005's decision §1 asserted "store per type is the uniform pattern … the
renderer is never the source of truth for status." The uniform-pattern instinct was
right for galaxies / structures / filaments; applying it to volumes was wrong,
because volumes have no app-side *data* — their only app-side state was settings,
which already have a home.

## Decision

**Per-field volume settings are settings, and live in the settings layer.**

- They move to `state.settings.volumes.fields: Record<VolumeFieldId, VolumeFieldSettings>`,
  alongside the existing `state.settings.volumes.masterEnabled`, seeded at
  construction from `SOURCE_REGISTRY` like every other setting.
- This **supersedes ADR 0005's decision to make `volumeStore` the authoritative home
  for per-field volume settings.** `state.data.volumes` is **dissolved**. Settings own
  the knobs; the scalar-volume renderer owns GPU residency (which cubes are uploaded)
  and reads the knobs per frame via a `draw(settingsOf)` projection — there is no
  `FieldEntry` settings mirror.
- Keyed settings follow the established copy-on-write pattern (the
  `labelCategoryVisibility` precedent), not a new dynamic-table facility;
  `SETTINGS_TABLE` remains for static scalars.

**What we are explicitly NOT deciding here:**

- The other per-type stores (`galaxyStore`, `structureStore`, `filamentStore`) are
  unaffected — they hold real data, not settings; ADR 0005's per-type-store pattern
  stands for them.
- We are not generalising the settings-table mechanism, and we are not renaming the
  (separately-noted, poorly-named) category-visibility settings — that belongs to the
  POI-dissolution work in ADR 0005 §5.

## Consequences

### Positive

- One home per value: settings own the knobs, the renderer owns GPU residency. The
  two-write contract across seven setters plus the boot/slot replays collapses to a
  single settings write; the renderer's seven value setters and the `FieldEntry`
  settings mirror are deleted.
- Volume settings now relate to every other setting identically — one settings mental
  model, not two. The split feature (master gate in settings, per-field knobs in data)
  is reunited under `state.settings.volumes`.
- The panel snapshot derives purely from settings, removing the split-brain where
  field identity came from the GPU and values from the store.
- Eliminates a class of silent-divergence bugs (panel shows one value while the GPU
  renders another; a forgotten mirror-write on a fade path leaves a stale field).

### Negative

- Dissolving `volumeStore` drops one of ADR 0005's four per-type stores — a deliberate
  asymmetry: volumes get no data-layer store because, after this decision, they have no
  app-side data to warrant one.
- A non-trivial refactor: the renderer, the engine setters, the frame-loop `draw` call,
  the snapshot, the volume slots, and the volume demand predicate all change.

### Neutral / forward-looking

- No on-disk format change — settings are not persisted to `.bin`.
- Establishes the precedent that *user-tunable knobs are settings regardless of how
  dynamic or keyed they are*, which future per-instance settings can follow.

## Implementation notes (non-binding)

- `draw(…, settingsOf, fadeOpacityOf)` packs each field's uniform from `settingsOf(id)`;
  the renderer keeps `residentPaletteId` as a GPU-residency fact and re-uploads a field's
  LUT when `settingsOf(id).paletteId` differs (palette is the one knob with a GPU side
  effect).
- `FieldEntry` slims to GPU resources + matrices + per-cube static config
  (`contrastCenter`, `envelope`, applied once at `addField` from the registry) +
  `residentPaletteId`.
- Clamp / policy logic moves to the setter boundary (one home for the *why*).
- The volume demand predicate repoints from `state.data.volumes` to
  `state.settings.volumes.fields[id].enabled`.

The forthcoming spec carries the full edit surface and the TDD plan.

## References

- [ADR 0005](0005-engine-data-layer-and-asset-loading.md) — Engine Data Layer &
  Demand-Driven Asset Loading (partially superseded by this ADR).
- [`docs/superpowers/conventions/simplicity.md`](../superpowers/conventions/simplicity.md)
  — the simple-vs-complect framing this resolves (value × place, single source of truth).
