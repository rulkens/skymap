# ADR 0014 — A Layer Is Organised by Concern Modules; Role Folders Hold Only What the Composition Root Reads

- **Status:** Accepted
- **Date:** 2026-11-03
- **Decision-makers:** project owner, Claude
- **Supersedes:** —
- **Superseded by:** —
- **Related:** ADR 0013, `src/layers/README.md`, `docs/superpowers/plans/2026-11-02-layer-m1-moves.md`

## Context

A Layer today is laid out by role: `render/`, `load/`, `present/`, `subsystems/`, `passes/`, `@types/` and the
rest, each flat (`src/layers/README.md`, "the folder layout is the contract"). That reads well while a Layer
is small. It stops reading well once one Layer holds several things: galaxyCatalog's point sprites, its
procedural and textured disks, its hi-res famous textures, its alias index and its structure membership are
spread across six role folders each, so following one feature means opening six folders, and nothing in the
tree says which renderer, subsystem, pass and types belong together.

The folders are also growing into bags. At `03972d396` the largest are body `@types/` (37 files), body
`bodies/` (36), body `present/` (34) and starCatalog `@types/` (21). The Layer M1 moves would add 55 types to
galaxyCatalog `@types/` (66 total), 20 to body `@types/` (57) and 34 helpers to missions `utils/`. One Layer
already shows the alternative: body's `subsystems/surfaceTiles/` groups 28 files by what they are for.

## Decision

**Inside a Layer, code is grouped by what it is for, not by what kind of file it is.** A Layer is a set of
concern modules, each a folder named for its concern, plus the few role folders and root files the
composition root and the ratchets read by path.

What stays by role, at the Layer root:

- the root files: `layer.ts`, `create.ts`, `destroy.ts`, `frame.ts`, `visibility.ts`, `heightAt.ts`;
- the folders the composition root imports leaf by leaf: `sources/`, `state/`, `bodies/`, `exhibits/`;
- `@types/` for the Layer's contract types only: `<Name>Runtime`, its facts, its id and source types.

Everything else lives in a concern module: `src/layers/<L>/<concern>/`, named for the thing
(`disks/`, `pointSprites/`, `hiResFamous/`, `aliases/`), never for a kind (`helpers/`, `misc/`, `common/`,
`shared/`, `other/`, `utils/`). Inside a module, files sit in the same role folders a Layer uses today, and
only the ones it needs: `disks/render/`, `disks/subsystems/`, `disks/passes/`, `disks/load/`,
`disks/present/`, `disks/ui/`, `disks/sagas/`, `disks/@types/`, plus `disks/utils/` for its helpers and
`disks/data/` for its constants (role folders; the bag-name ban applies to module names). So a module reads as a small Layer: what it is for from its name, what each
file does from the folder it sits in. Store-reaching files stay in `ui/` and `sagas/`, which the
store-boundary sweep keys on. A module whose role folder outgrows the cap splits into sub-modules
(`disks/procedural/`, `disks/textured/`), each with its own role folders.

**The cap:** no folder under `src/layers/` holds more than 15 files directly. A ratchet test
(`tests/conventions/layerFolderShape.test.ts`) enforces it with today's offenders allow-listed at their
current counts, which only shrink, and refuses the bag names above as module names.

**What this ADR does not decide:** the module map of any particular Layer (each Layer's restructure PR
proposes it); shaders (they stay in `src/services/gpu/shaders/<family>/`); core's own `src/` layout.

## Consequences

### Positive
- One folder per feature: the disks, the points or the aliases can be read, reviewed and deleted as a unit.
- No flat folder past 15 files, and no bag names, enforced rather than remembered.
- Module boundaries are where a Layer would split if it ever became two.

### Negative
- Every existing Layer is restructured once. The M1 plan absorbs it for the Layers it still has to move
  (batches C–E, Task 7), as a second move commit per PR; the Layers already moved are allow-listed until
  their own regroup PR.
- A module map is a judgment call per Layer, so each restructure PR carries one for review.
- `src/layers/README.md`'s "folder layout is the contract" table changes: contract members map to root files
  and the composition-read folders; the rest of the table becomes "lives in its concern module".

### Neutral / forward-looking
- A small Layer may be a single module (localBubble's shell), one level deeper than today.
- Paths grow one level (`galaxyCatalog/disks/render/proceduralDiskRenderer.ts`), the price of reading a
  module as a unit.
- Core's `src/utils/` and `src/@types/` keep their kind-first layout: they are shared libraries, not features.

## References
- ADR 0013 (registries built from Layer contributions)
- `src/layers/galaxyCatalog/`, `src/layers/body/subsystems/surfaceTiles/` at `03972d396`
