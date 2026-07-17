// Mirrors the SOURCE_REGISTRY `type` for the focusable arms: a galaxy-catalog
// point, an extended structure anchor, the Milky Way singleton, or a seeded
// scene body (`'body'` — currently star-only; see buildFocusable). Every
// FocusableTarget dispatch table is keyed on this tag.
export type FocusableTargetType = 'galaxyCatalog' | 'structure' | 'milkyWay' | 'body';
