# Structure search (cluster / supercluster / void)

> **Backlog item** · `ready` · area: UI & UX
> **Promote to:** straight to a small plan — design is clear.

## Problem

The command palette can't find large-scale structures. There's no way to look up "Coma", "A2703", "MSCC 216", a named void, etc. and fly to them.

## Current state (verified 2026-06-29)

`CommandPalette.tsx` indexes only three sources: the famous-galaxy atlas (~75 entries), the PGC alias index (~48k GLADE+2MRS rows), and a hardcoded Milky Way row. No reference to `structures_meta.json`, MCXC/MSCC names, or Abell numbers anywhere in the palette or its scorers.

## Direction

Add a third search index over the structure catalog (all three categories — names + Abell numbers + descriptions already in `public/data/structures_meta.json`) + a select handler that selects the structure and frames the camera. Naturally pairs with naming the great walls (a "Sloan Great Wall" / "CfA Great Wall" entry) so they become navigable by name.
