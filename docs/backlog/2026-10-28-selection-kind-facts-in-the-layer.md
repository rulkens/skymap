# A selection kind's facts live in its Layer

**Readiness:** `needs-design`. Ruled 2026-10-28: every per-kind fact moves into the Layer that owns
the kind, as a follow-up to the Earth satellites (#953–#956). That ruling consents to widening
`SelectionKindRow` for it.

## Problem

Core answers each per-kind question with a table or `switch` keyed by kind, so a new selectable kind
edits core once per question. Adding `'satellite'` took a row or a case in 14 core files, besides its
type unions. Black holes and Earth scenes paid the same cost. The compiler catches a missing row, but
a satellite's facts end up spread across core instead of living in its Layer.

## Current state

The core tables the satellites kind had to join (each `file:line` is the satellite row):

- `refOf` `src/services/engine/helpers/refOf.ts:50`: target → ref.
- `rowFocusable` `src/services/engine/helpers/rowFocusable.ts:18` and `buildFocusable`
  `src/services/engine/helpers/buildFocusable.ts:80`: whether, and how, a row becomes a focus target.
- `selectionHaloTable` `src/services/engine/helpers/selectionHaloTable.ts:70`: the halo style.
- `targetIdentityKey` `src/services/engine/helpers/targetIdentityKey.ts:21`: the identity key.
- `URL_HASH_FOR` `src/services/url/urlHashFor.ts:37`: the `#focus=` hash, which imports two Layers'
  encoders (`urlHashFor.ts:15-16`), although each Layer's row already declares `focusId.encode`.
- `focusFraming` `src/services/engine/camera/focusFraming.ts:61`: camera framing.
- `mayHaveLabel` `src/utils/selection/mayHaveLabel.ts:23`: whether a hover may carry a label.
- `pickingSlice` `src/state/settings/core/pickingSlice.ts:22`: the default pick switch.
- Every exhibit's picking snapshot: `src/data/exhibits/zoneOfAvoidance.ts:34`,
  `src/layers/body/exhibits/solarSystem.ts:42`, `src/layers/missions/exhibits/voyagerMissions.ts:94`.
- `galaxyType` `src/utils/math/galaxyType.ts:100`: an exhaustive `Source` switch that has to name every
  non-galaxy source.
- `SELECTION_KINDS` `src/data/selection/selectionKinds.ts:17`.

The closed unions (`SelectionRef`, `SelectionRow`, `FocusableTarget`, `SourceEntry`) and the `Source`
code also gain an arm per kind; they live in core `@types`.

## Idea

The Layer's `SelectionKindRow` (`src/@types/engine/layer/SelectionKindRow.d.ts`) declares the facts as
fields: focusable, halo style, framing, label, identity, and the URL hash taken from its own
`focusId.encode`. Core reads them by `ref.type`, and the tables above go. Exhibits name pick
categories with "all" as the default, so a new kind edits no exhibit; this would absorb the
"Narrow `PickingSettings.kinds`" item.

## Open

- **Type unions.** Can the unions be composed from Layer-owned type files without interface merging
  (which the conventions forbid), or does one core union file per kind stay?
- **Halo and framing.** These are core mechanisms, so the Layer picks a closed core variant rather
  than supplying code.
- **Pick codes.** Who assigns them (today `Source.Satellite = 37` is hand-picked).

## Consolidated here (2026-10-29)

Carried over from the two items this one absorbs (their files are deleted).

- **Sibling, not a field on the bundle** (from the 2026-08-17 focusable-kind registry item). Kinds do
  not map 1:1 onto render subsystems: stars and bodies share layers, famous galaxies live inside the
  catalog subsystem, Sgr A* is a caption-only anchor that draws nothing. The kind descriptor stays a
  sibling of the subsystem bundle; a bundle may reference the kinds it renders pick geometry for.
- **Trigger.** The next new focusable kind (globular clusters from the Harris catalog are the plausible
  candidate). The Milky Way v1 to v2 swap does not touch this surface.
- **Verification question** (from the `URL_HASH_FOR` duplication item): is `FocusableTarget` derivable
  from `SelectionRef` on every arm, so one `focusId.encode` per kind replaces `URL_HASH_FOR`? Ruled
  2026-10-29 as J15: the selection-rows saga stores `focusId` beside the focus row, and the hash
  writer, dome status and `shareUrlFor` all read that one selector. Before deleting `focusUrl`, add a
  galaxy ra/dec parity test. `zoneOfAvoidance` has no `focusId` row; `URL_HASH_FOR` returns null for
  it, consistent.
- **J2** (selection presentation in `docs/backlog/2026-10-29-layer-migration-leftovers.md`) is carried
  by this item too.

