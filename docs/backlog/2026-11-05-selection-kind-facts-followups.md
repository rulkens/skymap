# Selection-kind-facts follow-ups

Knots seen at the 2026-11-05 ground check for
[the selection-kind-facts spec](../superpowers/specs/completed/2026-11-05-selection-kind-facts-design.md) that its ideal
diff does not need. Each is small and independent.

## A 64-bit pick target

The pick word is `(code << 26) | localIdx` in one `r32uint` (`src/data/selectionEncoding.ts:54`,
`src/services/gpu/shaders/lib/selectionEncoding.wesl`), so at most 62 pick sources (sentinel 63). The spec
asserts the cap at boot. A two-channel target (`rg32uint`: code, index) would remove the cap and the 26-bit
index limit. Do it when the assert fires or an index outgrows 26 bits.

## `GlobularCluster: 34` names a structure category

`Source.GlobularCluster` is a structure marker category, while the plausible next selection kind is globular
clusters from the Harris catalog. Rename the category (or settle the naming) before that kind lands.

## Core branches on one kind

A new kind edits none of these, but each keeps one Layer's behaviour in core:

- `src/services/engine/helpers/logCameraState.ts:35-40` lists the body-like kinds for the debug altitude;
  `pivotRadiusMpc(focusRow) !== null` already says the same thing.
- `src/state/selection/watchFocusTweenSaga.ts:57` waits on the structure bulk load by kind.
- `src/state/url/hashParamSources.ts:157`, `src/state/camera/watchFlyToLonLatSaga.ts:66` and
  `src/services/engine/frame/passes/orbitTrailsPass.ts:76-77` check `type === 'body'`.
- `src/state/selection/captureGalaxyFocusIds.ts:45` is J8's (galaxy re-anchor).
- `src/services/engine/frame/runFrame.ts:204` feeds the structure focus subsystem only a `structure` row; a
  Layer-contributed fact on the row would let core drop the kind name.
