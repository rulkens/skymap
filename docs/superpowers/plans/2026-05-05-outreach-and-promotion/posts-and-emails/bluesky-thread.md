# Bluesky thread (4 posts)

## Target

- **Compose URL:** `https://bsky.app` _(source: bsky.app is the canonical web client for the AT-protocol Bluesky network; retrieved 2026-05-06)_
- **Best window:** Roughly 2 h after the HN post — late afternoon in continental Europe / lunchtime US east coast. The astronomy community on Bluesky skews EU + east-coast US, and posting after HN means the embed/OG card will work and the thread can reference HN traction by reply if it landed.

### Mention candidates

| Handle (draft)                  | Verified?                                                        |
| ------------------------------- | ---------------------------------------------------------------- |
| `@sdss.bsky.social`             | **TO VERIFY** — see callout below                                |
| `@aaswwt.bsky.social`           | **TO VERIFY** — see callout below                                |
| Brice Ménard                    | **TO VERIFY** — no verified handle found                         |

> **TO VERIFY — Bluesky handles for SDSS, AAS WWT, and Brice Ménard.**
>
> A 2026-05-06 search for `site:bsky.app sloan digital sky survey`,
> `site:bsky.app aas worldwide telescope`, and Bluesky search of "Brice
> Ménard" / "mapoftheuniverse" did **not** surface official accounts
> for any of the three. The closest hits were:
>
> - `@allthegalaxies.galaxyzoo.org` — adjacent (Galaxy Zoo posts SDSS
>   imagery) but not an SDSS-run account.
> - `@aas.org` — official American Astronomical Society account; not
>   WWT-specific. WWT itself does not appear to have a separate
>   Bluesky presence as of the search date.
> - `@adavidweigel.bsky.social` — A. David Weigel, a personal account
>   that bills itself "Astrovizicist for WorldWide Telescope". Not an
>   official WWT channel, but the closest individual presence.
> - For Brice Ménard, only third-party mentions (e.g. an SFI welcome
>   post). No verified personal account.
>
> Before posting, do a fresh Bluesky in-app search for each of the
> three. If a handle still cannot be verified, **drop the @-mention
> silently** rather than guessing — bad mentions clutter the thread
> and can ping unrelated users.

## Send checklist

- [ ] Re-resolve the three TO-VERIFY handles (in-app Bluesky search). Drop any that still don't resolve — replace the cc-line in post 4 accordingly.
- [ ] Open Bluesky web; create the four posts as a chained reply thread (post 1, then "Reply" → post 2, etc).
- [ ] Attach `docs/screenshots/hero.gif` to post 1.
- [ ] Attach `docs/screenshots/all-three-surveys.png` (or equivalent — see Task 1 deliverables) to post 2.
- [ ] Attach `docs/screenshots/infocard-detail.png` to post 3.
- [ ] No image on post 4.
- [ ] After all four are up, open your profile and confirm the thread is chained (not four orphan posts).
- [ ] Verify the hero GIF auto-plays on post 1.
- [ ] Update this file's `Status:` line to `sent YYYY-MM-DD`.

## Body

### Post 1

```
Spent the last few months building skymap — an interactive WebGPU 3D
explorer for SDSS, 2MRS, and GLADE galaxy catalogs in the browser. No
install, just Chrome / Edge 113+ (and Firefox 141+ / Safari 26+).

Live: https://skymap.rulkens.com
Source: https://github.com/rulkens/skymap

[attach hero.gif]
```

### Post 2 (reply to 1)

```
The cosmic-web wedge is right there — Sloan Great Wall, the Coma
cluster, the local-volume 2MRS galaxies. Density-correction toggle
(1/V_max, Schechter LF) lets you see structure unbiased by Malmquist.

[attach all-three-surveys.png]
```

### Post 3 (reply to 2)

```
Up close, dots become DR18 thumbnail cutouts (SDSS) or DSS proxies via
CDS hips2fits (2MRS / GLADE). Click to pin metadata: redshift, lookback
time, NED link.

[attach zoomed-thumbnail-infocard.png]
```

### Post 4 (reply to 3)

```
Built as a personal learning project — the source is documented
didactically (every WebGPU surprise written up where it bit me). GW
EM follow-up folks, SDSS team, AAS WWT crowd — feedback very welcome.

[mentions: drop or include based on TO-VERIFY resolution above]
```

_Editorial note for post 4: the original draft included
`cc @sdss.bsky.social @aaswwt.bsky.social` and a "(handle?)" placeholder
for Brice Ménard. **Do not paste those literal strings** — they'll show
up as broken @-tags. Replace with the verified handles you find at
send-time, or drop the cc-line entirely._

## Verification

After posting, manually:

- [ ] Open your Bluesky profile and confirm all four posts appear in a single thread (each marked "in reply to" the previous).
- [ ] Confirm hero.gif auto-plays on post 1 (Bluesky autoplay was sometimes flaky on large GIFs — if it shows as a static frame, the file may be over the size limit and you'll want to re-encode smaller and edit-replace).
- [ ] Confirm any cc-mentioned handles resolved to real accounts, not unclaimed-handle placeholders.

## Status

`pending`

> Audit pass: 2026-05-06 — bsky.app composer URL confirmed; second-pass Bluesky searches for SDSS / WWT / Brice Ménard re-confirmed no verified handles exist (the TO-VERIFY callout above is the source of truth and stays in place).

