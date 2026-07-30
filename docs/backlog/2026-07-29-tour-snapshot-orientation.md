# Tour scene snapshots cannot carry `orientation`

`needs-design` — surfaced 2026-07-29 while porting `useUrlSync` to the hash sagas
(PR for `url-hash-saga-port`, Task 9).

## The problem

A tour beat can restore eight settings clusters into a scene, but it cannot set which
astronomical pole the camera treats as up. So a beat that wants the galactic plane
horizontal has no way to say so — the visitor's own orientation choice persists through the
whole tour, and a beat authored against one frame is composed wrongly under another.

## Verified current state

`SettingsSnapshot` is a `Pick` of exactly eight clusters, and `orientation` is not one of
them:

- `src/@types/engine/settings/SettingsSnapshot.d.ts:34-46` — `Pick<EngineSettingsState,
'galaxyCatalogs' | 'structures' | 'volumes' | 'filaments' | 'milkyWay' | 'flow' |
'orbitTrails' | 'labels'>`
- `src/@types/settings/EngineSettingsState.d.ts:73` — `orientation` lives on the settings
  state as a bare scalar, outside every cluster.

Both `mergeSnapshot` dispatch sites carry that exact type, so the path is closed by the
type system, not merely unused:

- `src/state/tour/restoreSceneSaga.ts:43` — `put(mergeSnapshot(snapshot.settings))`, where
  `SceneSnapshot.settings: SettingsSnapshot`.
- `src/state/tour/guidedTourSaga.ts:132` — `put(mergeSnapshot(computeSceneEntering(...)))`,
  whose return type is `SettingsSnapshot`.

Runtime is more permissive than the types: `mergeSettingsSnapshot` would spread an
`orientation` key if one ever arrived. Only the types close it.

## How it surfaced

The hash table's `orientation` row declares `writesOn: [setOrientation, mergeSnapshot]`,
commented "can change `orientation` without `setOrientation` ever being dispatched". That
comment describes an intended capability, not a real one. The dead entry was removed in the
same change that filed this item, so the table states only what is true today.

**If this item ships, the `mergeSnapshot` trigger must go back onto the `orientation` row in
`src/state/url/hashParamSources.ts`** — otherwise a tour-restored orientation would not reach
the URL until the next unrelated hash trigger fired. The failure is stale-not-wrong (the
write recomposes the whole body), but it is a real gap.

## Options

1. **Add `orientation` to the `SettingsSnapshot` `Pick`.** Smallest diff. Every existing
   snapshot author gains an optional field; `Partial<SettingsSnapshot>` means old snapshots
   keep working untouched. Check whether the beat-authoring format and `computeSceneEntering`
   need a matching field before assuming this is one line.
2. **A separate per-beat camera/frame concern.** Orientation is arguably camera composition
   rather than a scene setting, and the tour already owns pose. This keeps
   `SettingsSnapshot` about scene contents but adds a second restore path.
3. **Leave it.** A beat that needs a specific frame could dispatch `setOrientation` directly
   from its own effect, outside the snapshot. Cheapest, but it puts one setting on a
   different mechanism from the other eight.

Option 1 unless the tour author wants orientation treated as camera rather than scene.

## Related

- `docs/superpowers/specs/2026-07-29-url-hash-saga-design.md` §3.2 — the row this came from.
- `project_solar_system_time_control` / the grand-tour beat work — whoever owns beat
  authoring should make the call between options 1 and 2.
