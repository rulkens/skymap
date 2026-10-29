# Tag the remaining body-id fields

**Readiness:** `ready`.

#941 (`plans/completed/2026-10-22-scene-body-id-tagged.md`) tagged scene-body ids as `SceneBodyId`
(`Tagged<string, 'sceneBodyId'>`), stamped once in the body makers and validated with `isSceneBodyId`
at the URL and payload boundaries. Left as plain `string` there: `RotationElements.id`,
`SampledTrack.id`, `BodySpec` and the other authoring seeds the makers read. Tag them at their
definition (stamped through `asSceneBodyId`) so a typo in a seed row is a compile error and the
makers stop re-stamping. The two `as BodySourceId` casts on a source entry's id
(`bodySelectionRow.ts:34`, `sceneBodyPickId.ts:18`) go if the source registry types its body rows'
`id` as `BodySourceId`.
