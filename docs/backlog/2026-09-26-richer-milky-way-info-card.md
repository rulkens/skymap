# A richer Milky Way info card

`needs-design`. Pick this up after the `milkyWay` Layer (PR #826) lands.

## The gap

The Milky Way's detail card (`src/layers/milkyWay/ui/MilkyWayDetailCard/`) shows only these:

- a header and the name;
- a thumbnail;
- the type line `Barred spiral (SBbc)`;
- `≈ 8 kpc to the galactic centre`;
- a one-line description, "Our home galaxy — you are here".

All of it comes from the static record `src/data/milkyWay/milkyWayInfo.ts`. Galaxy cards carry rows
of facts, so next to them the Milky Way card looks bare. This is how it was before the Layer port too.

## To decide

Which facts the card should carry. The user left this open on 2026-09-26. Candidates:

- disc diameter;
- star count;
- stellar and total mass;
- age;
- the number of spiral arms and the bar;
- where the Sun sits: its galactocentric radius, and its height above the plane.

Each figure needs a sourced value. For a longer text, see the `DescriptionBlock` used by
other cards. It is a content change: new `MilkyWayInfo` fields, the card rows, and tooltips in
`InfoCard/tooltips`.
