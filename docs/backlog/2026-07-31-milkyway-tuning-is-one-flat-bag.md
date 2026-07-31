# MilkyWayTuning is one flat bag for knobs that belong to one contributor

**Status:** needs-design (2026-07-31)

`MilkyWaySettings = { enabled, labelEnabled } & MilkyWayTuning`
(`src/@types/settings/MilkyWaySettings.d.ts`), and all eight `MilkyWayTuning` fields
are knobs of the _sprite_ implementation: `starSizeScale`, `exposure`, `starPxMin`,
`starPxMax`, `softness`, `lodApparent`, `aggregateDivisor`, `starCount`.

Two consumers read that one bag today, and one of them ignores nearly all of it.
`milkyWayCloud/io.wesl` records the tell in its own prose — _"Dust ignores all
four"_ — and `milkyWayLayer` packs the whole struct anyway because the layout is
shared. The dust pass carries eight star knobs to reach two fields.

## Why it matters now

The Milky Way is heading toward a third radiance contributor (an analytic emission
field behind the same aggregate target). A third consumer of a flat bag is the second
special case, and it lands in two places at once:

- `MILKY_WAY_SLIDER_FIELDS` renders every knob in the panel regardless of which
  contributor is live, so a user tunes `starPxMin` while looking at a field that has
  no sprites.
- The knobs stop being independent. `starPxMin`, `lodApparent` and `aggregateDivisor`
  already fight each other because the sprite pass carries both resolved and
  unresolved populations behind one clamp; a second emission source makes `exposure`
  ambiguous too.

## Shape to explore

Group the knobs by the contributor that reads them, so the panel can show the live
contributor's rows and a new contributor brings its own group rather than widening a
shared struct. The registry (`MILKY_WAY_SLIDER_FIELDS`) and its parity test are
already the right mechanism — the open question is whether the grouping lives in the
settings shape, in the registry rows, or only in the panel.

Not urgent for the analytic field itself: that pass gets its own uniform module
rather than extending `milkyWayCloud/io.wesl`'s `params0`/`params1` lanes, and needs
few enough knobs to fit the existing registry cleanly. This is the thing that breaks
after it.

## Interactions

- **[Schema-driven slider rows](2026-07-29-schema-driven-slider-rows.md)** — that
  item is about the nine hand-edited sites per knob; this one is about which
  consumer a knob belongs to. Different axes, same files. Sequence that one first.
