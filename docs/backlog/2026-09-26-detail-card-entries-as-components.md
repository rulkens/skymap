# Detail-card entries as components, like the `debug` slot

`ready`, to pick up after the `milkyWay` Layer (PR #826) lands.

## The asymmetry

A Layer's two UI slots render their content in different ways:

- **`debug`:** `DebugPanel.tsx` renders each entry as a component (`<Section key={index} />`).
  A Layer passes its container straight in: `{ slot: 'debug', content: MilkyWayTuningSectionContainer }`.
- **`detailCard`:** `InfoCard.tsx:88,112,120` calls the entry as a plain function
  (`detailCardFor(...).Detail({...})`), and `DetailCardEntry` types `Detail`/`Compact` as
  `(props) => ReactNode`. Calling a component that way would run its hooks inside InfoCard's
  render, so a galaxy → Milky Way switch would change InfoCard's hook order. So every entry
  wraps its card in `createElement(...)` to get a component boundary. Each Layer's `layer.ts`
  imports `react` for this alone: zoneOfAvoidance, blackHoles and milkyWay.

## The change

- `src/@types/components/infoCard/DetailCardEntry.d.ts`: `Detail` becomes
  `ComponentType<DetailCardProps<K>>` and `Compact` becomes `ComponentType<CompactCardProps<K>>`.
- `InfoCard.tsx`: render `<entry.Detail {...props} />` and `<entry.Compact target={…} />`.
- `detailCardTable.ts` `CORE_DETAIL_CARDS` and the three Layers' `layer.ts`: pass the card
  components directly. This drops the wrappers and the `react` imports.

Check that each card's own props type accepts `DetailCardProps<K>`. The `target` arm is
`Extract<FocusableTarget, { type: K }>`, and `selectedMemberCount` is structure-only.
Also check that the InfoCard tests don't call `.Detail(...)` as a function.
