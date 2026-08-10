# The tuning types grew into flat bags (decision, 2026-08-02)

**MEASURED.** `GalaxyFieldTuning` reached 20 flat fields across five unrelated
contributors, and `GalaxyDustCloudParams` reached 17. Both grew by widening
rather than grouping, once per feature.

**MEASURED, the type diagnosed itself.** `GalaxyDustCloudParams`' own docblock
records the defect: "The arm-lane group at the end describes the lane the
particles are SEEDED on rather than the particles themselves; they live here
because the cloud is their only client." A doc comment explaining why a field
is in the wrong place is the signal to move it, not to explain it better.

**MEASURED, the reach.** `buildSfEventCatalog(geometry, cloud, seed)` takes the
entire 17-field dust-cloud bag to read ONE field, `sfActivity` — the same shape
`docs/backlog/2026-07-31-milkyway-tuning-is-one-flat-bag.md` names for the
sprite path ("the dust pass carries eight star knobs to reach two fields").
That backlog item is about a DIFFERENT type (`MilkyWayTuning`, sprite
settings) and stays open; what transfers is its prediction, that "a new
contributor brings its own group rather than widening a shared struct".

**DECISION.** Group both types by the contributor that reads them, one group
per UI section: `GalaxyFieldTuning` into disc/arms (with armCloud nested inside it)/dust/hii/sfMap;
`GalaxyDustParams` into tau+rV at top with disc/cloud/texture/armLane below.

**DECISION, the substantive one: star formation leaves dust entirely.**
`sfActivity`, `bubbleScale` and `bubbleCarve` become `GalaxyParams.starFormation`.
The SF event catalog is a shared placement truth (design doc N3) feeding dust
cavities, HII emission and — once [the SF-map decision](sf-map.md) lands — the automaton. Only the first of
those three is dust. Keeping the rate inside the dust cloud forced the HII
EMISSION tier to import dust params to find out how often stars form.

**Side effect worth keeping.** `heightRatio` currently exists at two nesting
levels under the same name with different referents (dust layer vs stellar,
particles vs dust layer). Grouping renames them apart as `disc.heightRatio`
and `cloud.heightRatio` without either changing meaning.
