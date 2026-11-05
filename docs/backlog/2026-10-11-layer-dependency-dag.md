# Layer dependency DAG

`needs-design` — do not start before the trigger below fires. Written
2026-10-11, out of the structure Layer spec (R13). Start with
`/wt layer dependency dag`; the body of this file is the brief.

## The problem

A Layer may never import another Layer (`src/layers/README.md`). When one
Layer needs a fact another Layer owns, the read has to go through core
state and core types instead. That works while there is one such read. It
does not say which Layer depends on which, it gives the reader no type for
the other Layer's facts, and composition order is the only thing that
orders their `create` calls.

## Current state

One cross-Layer read exists. `galaxyCatalogPlanner`
(`src/layers/galaxyCatalog/frame.ts:57-79`) publishes
`structureMemberCount` for the selected structure. It learns which
structure is selected from the core selection row
(`state.selectionRows.select`, narrowed on its `structure` arm), not from
the structure Layer: the structure record's centre and radius ride in on
the core `SelectionRow` union. Nothing declares that galaxyCatalog depends
on structure, and nothing would fail if structure stopped publishing that
arm.

## Trigger

The second cross-Layer read. One read is cheaper through core than a DAG;
two are where an undeclared dependency starts to cost a debugging session.

## Options

1. **`Layer.dependsOn: readonly LayerName[]`, typed facts access.**
   `createLayers` topologically sorts the composition by it (a cycle throws
   at boot), and a Layer's `create` receives a typed, read-only view of
   each dependency's facts (`FactsOf<Dep>`). Explicit and checkable; adds
   a contract member and a sort.
2. **Keep routing through core, but name it.** A core-owned selector per
   cross-Layer fact, listed in one file, so the dependency is at least
   greppable. No new contract member; the dependency stays undeclared at
   the Layer.
3. **Do nothing until a third read.** Defensible if the second read is
   also selection-shaped and core already carries it.

Open question for the design: whether `dependsOn` also orders `destroy`
(reverse topological), or core keeps destroying in composition order.
