# `Layer.settings` erases the keys the composed settings type needs

`Layer.settings` is typed `readonly SettingsFragmentLike[]` (`Layer.d.ts:26`), whose `key` is a bare
`string`. `ComposedClusters` (`ComposedClusters.d.ts:11`) needs `key: infer K extends string` —
literal keys — to produce any cluster at all, so over that field it yields `never` and drops out.
`APP_SETTINGS_FRAGMENTS` is therefore a parallel authority: adding a cluster to a Layer and adding
it to the tuple are two edits, and nothing checks they agree. Nothing reads `Layer.settings` today
(`layers: []`), so the seam is inert until the first Layer with settings forms.

Two ways to close it, either a (d) decision:

1. A const `Settings extends readonly SettingsFragmentLike[]` type parameter on `Layer` (and
   `const Settings` on `defineLayer`), so the tuple derives from `composition.layers` and the
   parallel authority disappears.
2. A boot assert that `layers.flatMap((l) => l.settings ?? [])` set-equals the tuple — cheaper, keeps
   two authorities but makes a drift throw at import rather than silently narrow a type.

Recorded as row **A8** in §13 of
[the layer-composition design spec](../superpowers/specs/2026-09-09-layer-composition-design.md).
PR (d) — the first Layer value — consumes this item; it must not land with the seam open.

Adjacent, for (d)/(e)'s move manifest: `structureMarkerRenderer.ts:69` imports `UNIFORM_BYTES` from
`galaxyCatalog/galaxyPointVertexLayout` to size its pick camera buffer (`milkyWayPickRenderer.ts:48`
does the same). That byte count describes a buffer core's `pickUniformBytesOf` packs, so it belongs
beside the packer, not in a sibling Layer — two cross-Layer edges to cut when the families split.
