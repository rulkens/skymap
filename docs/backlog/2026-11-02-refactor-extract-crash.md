# refactor `extract` crashes on a type alias into a `.d.ts`

`npm run refactor -- extract` threw instead of moving the symbol or refusing with a worklist, on 2026-11-02:

```
Attempted to get information from a node that was removed or forgotten
```

This is ts-morph's error for reading a node after `remove()` or a `forget()`: the planner reads a declaration
(or a reference to it) after it has already taken it out of the source file. The type was then extracted by
hand in 393be6506, so the crash was never looked into.

## Repro

The state before the hand extraction is `393be6506^`. In a throwaway worktree at that commit:

```bash
npm run refactor -- extract \
  packages/website/src/components/shared/media/gallery/useGallery.ts#Gallery \
  packages/website/src/@types/Gallery.d.ts --dry
```

(drop `--dry` if the dry run does not reach the failing step). The command was run with the paths given relative
to `packages/website/src`; confirm the repro with the full paths above first.

The case has three things the CLI's own tests may not cover; check each:

- the target is an exported **type alias** (`export type Gallery = GalleryState & { … }`), not a function;
- the file keeps a value (`useGallery`) whose **return type** names the target, so the source file needs a
  `import type` of the moved symbol added back;
- the destination is a **`.d.ts`** file, under `packages/website/` (outside the `src/ + tests/ + tools/` project
  roots the skill describes).

## Done when

The repro either extracts `Gallery` (with `useGallery.ts` importing it back as a type) or refuses with a message
that names the cause, and a `planExtract` fixture test in `tests/tools/utils/refactor/` pins it. Related: the
type-import carry bug in [2026-07-21-refactor-cli-followups.md](2026-07-21-refactor-cli-followups.md).
