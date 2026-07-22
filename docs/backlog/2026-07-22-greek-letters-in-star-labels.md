# Greek letters in star labels

**Raised:** 2026-07-22 (user, during constellations execution)

## Problem

Famous star names in the seed spell out Bayer designations: "Delta Velorum",
"Epsilon Eridani", etc. The proper Bayer form is the Greek letter (δ Velorum,
ε Eridani). The MSDF label font atlas (`tools/fonts/buildFontAtlas`) does not
currently include Greek codepoints, so the seed cannot use them.

## Sketch

1. Add the Greek lowercase range (U+03B1–U+03C9, plus uppercase if any name
   needs it) to the font-atlas charset; regenerate the atlas. Check atlas-size
   headroom — the multi-font atlas packs all faces into fixed slots.
2. Audit `data/seeds/famous_stars.seed.json` names[]/label fields: swap
   spelled-out Bayer prefixes for the letter form where that is the canonical
   display name; keep the spelled-out form in `names[]` for search aliases.
3. Search must still match "delta velorum" → δ Velorum (alias indexes already
   handle multi-name entries; verify the transliteration alias stays).
4. Constellation label producer (Latin figure names) is unaffected, but any
   future per-star constellation labels would want the same glyphs.

## Open questions

- Which faces in the multi-font atlas need the range (label face only, or
  caption/tooltip faces too)?
- Kerning/metrics quality of Greek glyphs in the chosen fonts.
