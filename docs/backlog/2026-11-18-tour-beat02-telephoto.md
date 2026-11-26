# Tour beat 02: a telephoto close-up of Earth and the Moon

`needs-design`, parked when the tour landed (2026-11-18). The owner's idea (2026-11-07): beat 02 dolly-zooms
to a telephoto close-up of Earth and the Moon at their true relative size, then back to the overview.

Four preview clips were built on the blending seq (Earth side or Moon side, from 10M or 3M km: swing,
dolly zoom out, back in, swing to the overview, one `seq` with overlaps `[2, 2, 4]` s). They are commit
`202006283` on PR #1070's history (`git fetch origin pull/1070/head` keeps it reachable); `git cherry-pick`
restores `earthAndMoonTelephotoPreview.ts`, its `ClipId` entries and registry rows.

Open: which variant, one beat or two, pacing. Lessons from the previews:
- turn only at a wide lens (the star sweep is turn rate / fov; keep it under ~0.4 frame heights/s);
- the Moon side must get beyond the Moon before the dolly zoom, or the eye flies past it;
- judge the framing with the disc sizes in view, not the centres alone.
