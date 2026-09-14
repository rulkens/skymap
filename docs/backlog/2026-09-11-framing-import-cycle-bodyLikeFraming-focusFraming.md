# `bodyLikeFraming` ⇄ `focusFraming` import cycle

**Raised:** 2026-09-10/11, tuning task 4 (T4) on PR #647
(`.superpowers/sdd/2026-09-01-camera-pivot/tuning-T4-report.md` §3, `madge
--circular`). Pre-existing, not introduced by this branch. User ruled:
backlog, not this PR.

`madge --circular` over `src/data/camera src/utils/camera src/state/camera
src/services/camera src/services/engine/camera` reports one genuine
intra-folder cycle (its finding #12):

```
services/engine/camera/bodyLikeFraming.ts > services/engine/camera/focusFraming.ts
```

Neither file is touched by the camera-pivot branch's diff.

## Where the edges are

- `src/services/engine/camera/bodyLikeFraming.ts:29` — `import type {
FocusFraming } from './focusFraming'` (type-only).
- `src/services/engine/camera/focusFraming.ts:43` — `import { bodyLikeFraming
} from './bodyLikeFraming'` (value import).

The cycle is a type-only back-edge from `bodyLikeFraming` into `focusFraming`
purely to name the `FocusFraming` shape, crossed by `focusFraming`'s ordinary
value import of `bodyLikeFraming` going the other way.

## Fix shape

Extract the `FocusFraming` type out of `focusFraming.ts` into its own file
under `src/@types/` (per the project's one-type-per-file convention for
`@types/`), and have both `bodyLikeFraming.ts` and `focusFraming.ts` import it
from there. That removes the back-edge entirely rather than reordering the
existing files.
