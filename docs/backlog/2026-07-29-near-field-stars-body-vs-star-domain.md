# Near-field stars are bodies in the data layer, a star catalog in the registry

One source, three domains, and they disagree about what it is.

| Layer        | Where `famousStar` lives                   | What it calls it |
| ------------ | ------------------------------------------ | ---------------- |
| registry     | `FAMOUS_STAR_ENTRY`, `type: 'starCatalog'` | a star catalog   |
| seed data    | `src/data/bodies/famousStars.generated.ts` | a body           |
| engine store | `BodyStore.famousStarsMeta`                | a body           |
| settings     | `starCatalogs.items.famousStar`            | a star catalog   |

`famousStarsMeta` sits on `BodyStore` because **there is no star store** —
`BodyStore`, `GalaxyStore`, `StructureStore`, `PickStructureStore` are the whole
set. That placement was not a mistake given the options; it is the symptom.

## The Sun is the sharpest instance

The Sun is addressed two ways, and neither is the whole truth:

| Identity                                           | What it owns                                       | What it cannot do          |
| -------------------------------------------------- | -------------------------------------------------- | -------------------------- |
| `SUN_ENTRY`, `Source.Sun = 26`, `bodies.items.sun` | the label gate, the visibility gate, the panel row | never appears in a pick    |
| `id: 'sun'` in `famousStars.generated.ts`          | the drawn dot, the sphere, the pick                | cannot be gated on its own |

`starPointsLayer` and `starSpheresLayer` stamp every seeded star — the Sun
included — with `packSelection(Source.FamousStar, …)`. A click on the Sun resolves
through the `starCatalog` arm, so `Source.Sun` is a registry code no pick ever
carries, and `PICK_SEEDS_BY_BODY_ID.sun` exists only to satisfy a
`Record<BodyId, …>`.

Meanwhile `visibleStars` — a star-pipeline function — reads
`settings.bodies.items.sun.enabled` to decide whether to include a member of the
star seed map. A body-cluster settings row governs star-pipeline geometry.

## Essential vs accidental

**Essential:** the Sun really is both a star and the near-field origin, and the
curated stars really are near-field objects rendered as spheres up close. Drawing
through the star pipeline while captioning through the near-field pipeline is
correct — that is the slab those names belong on.

**Accidental:** the _identity_ is duplicated. One object, two source codes, each
authoritative for a different half, with no seam reconciling them; and one source
whose data, store, registry type and settings home do not agree on its domain.

## Why this is not a regression

Giving the Sun its own row is what made it visible. The same entanglement was
previously hidden inside a hardcoded `id === 'sun'` exemption in `visibleStars` —
special-cased rather than modelled, so there was nothing to notice. Naming the
duality is progress; resolving it is a separate design.

## Directions, none chosen

- **A star store**, so the curated stars stop borrowing the body domain. Cheapest
  to describe, but it splits `famousStars.generated.ts` from the body atlas it
  currently sits beside, and the near-field sphere path genuinely is the body
  renderer.
- **Membership, not identity** — `Source.Sun` stops being a pick identity and the
  body row becomes a _view_ onto the seed-map member. Closes the dead pick row.
- **Lift the Sun out of the seed map** so `Source.Sun` becomes real. Most honest,
  most expensive; duplicates star sphere/point rendering it gets for free today.
- **A `bearsPick` capability axis** — already ruled **over-engineering** by an
  architecture review: pickability is data already (`drawPick` presence on the
  layer row), so it would be a second home for one fact, and narrowing `BodyId`
  revives the silent-null the total table prevents. Recorded so it is not
  re-proposed without new argument.

Needs a grill session before a spec. The hinge question has not been asked: is the
curated map "stars near us" (the Sun belongs in it) or "stars other than ours" (it
does not)? The answer decides most of the rest.
