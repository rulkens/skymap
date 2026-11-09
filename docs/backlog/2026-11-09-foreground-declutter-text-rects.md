# Foreground captions declutter by text rects

**Readiness:** `ready`. A draft was written and tested on 2026-11-09, then dropped so it could land on its own.

## Problem

The NEAR0 label director (`FOREGROUND_LABEL_DIRECTOR`, `src/data/labels/foregroundLabelDirectorConfig.ts`)
keeps a caption only when its anchor lies 48 px from every higher-ranked survivor. Text width is
never read. Short names (planets, most stars) roughly fit inside that circle, so they rarely overlap.
Long ones collide while their anchors are far enough apart: at the oblique Milky Way pose
`#pose=a,-.000447,-.00714,-.00397,.138,.827,.0373,0&layers=stellarStreams`, `Cetus-New`/`AAU-ATLAS`,
`AAU-AliqaUma`/`Murrumbidgee` and `OmegaCen-Fimbulthul`/`Omega Centauri` draw over each other.
Long mission names near a planet can do the same.

## Fix (as drafted)

The COSMO director's `declutterByBboxOverlap` (`label2DDirector.ts`) already tests measured text
rects through `labelScreenRect`, and every director already gets `measure` (`attachLabelDirectors.ts`).
Move NEAR0 onto it, keeping the two rules only the separation arm has today:

- a zero-`fadeAlpha` label returns no rect (it never blocks a visible caption);
- a `lift`ed label's rect moves up by `proposedLiftPx(lift.subjectSizePx)`, so a rover under its
  planet's anchor is judged against the planet's lifted text.

Then delete the separation arm, `src/utils/labels/declutterByScreenSeparation.ts` + its test, and the
`Label2DDeclutterPolicy` union (the config carries `declutterPadPx: number`; 8 px for both slabs).
Draft size: 11 files, +76 / −229.

Tests: a repro (two 9-glyph names 60 px apart, `minPixelSize: 30`: both kept before, one after);
the two lift-order tests that probed `measure` call counts now count per id (the declutter measures too).

## Before landing

- `npm run perf:cpu` before and after: the rect pass measures every NEAR0 caption each frame.
- Eye checks, main vs branch: dense stars, Mars with rover captions (lift), the stream pose above.
- The COSMO change: zero-alpha labels stop blocking there too. Check that it's harmless.
