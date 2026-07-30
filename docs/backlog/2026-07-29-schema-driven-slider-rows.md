# Schema-driven slider rows

**Status:** needs-design (2026-07-29)

Supersedes the older "VolumeFieldRow schema-driven UI" line, which scoped the problem to
one component. It is panel-wide.

## The cost, measured

Adding `hdrKnee` and `hdrHeadroom` to Display (the `?hdr` control work) took nine
hand-edited sites per knob:

| #   | Site                                                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | `data/defaults.ts` — the default constant                                                                             |
| 2   | `@types/settings/EngineSettingsState.d.ts` — the field                                                                |
| 3   | `state/settings/initialState.ts` — the seed (plus its import)                                                         |
| 4   | `state/settings/settingsSlice.ts` — the reducer                                                                       |
| 5   | `state/settings/settingsSlice.ts` — the action export list                                                            |
| 6   | `state/settings/selectors.ts` — the selector                                                                          |
| 7   | `components/containers/<X>Container.tsx` — selector import, `useAppSelector`, action import, `useCallback`, prop pass |
| 8   | `components/SettingsPanel/<X>Section.tsx` — prop pair in the type, in the destructure, and the `<Slider>` block       |
| 9   | test fixtures — `makeSettingsFixture.ts`, plus any section-props fixture                                              |

Nothing in that list is a decision. It is the same shape every time, and every step is a
place to forget one.

## Where it has accumulated

- `VolumeFieldRow` — 7 hand-coded sliders.
- `DisplaySection` — 6 scalars (exposure, hdrKnee, hdrHeadroom, bloomStrength,
  bloomThreshold, plus the curve dropdown).
- `StarsSection` — the three exposure-ramp anchors, size, brightness, glow overlap,
  aggregate cap.

## Shape to explore

A row descriptor — id, label, min/max/step, format, default — that a generic renderer
consumes, with the slice reducer and selector derived from the same table rather than
written out. The settings slice's `writeVolumeField({ id, patch })` is the nearest
existing precedent for a patch-shaped seam; whether the whole panel can move to one, or
only the numeric rows, is the open question.

## Interactions

- **[SettingsPanel polish](2026-07-22-settings-panel-polish.md)** — same files, and its
  section re-ordering would be far cheaper against a table than against 2.3k lines of
  hand-coded rows. Sequence this first, or accept doing the reflow twice.
- Branch `settings-seam` carries an agreed settings-by-source-type design awaiting a
  plan. Check it before specing this — the two overlap and the seam work may already
  answer part of it.
