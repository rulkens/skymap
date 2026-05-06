# Outreach posts and emails — per-item drafts

This folder is the source of truth for every post and cold email in the
v0.2.0 outreach campaign. Each item is a self-contained markdown file:
recipient or submission URL (with citation), send-checklist, the proofread
body, and a verification command where one applies.

The drafts originally lived bundled inside
[`task-4-public-posts.md`](../task-4-public-posts.md) and
[`task-5-academic-emails.md`](../task-5-academic-emails.md). Those files
are kept for historical reference; the per-item files in this folder are
authoritative going forward.

## Status

Nine items active, one (`email-5-lvk-em-followup.md`) **dropped** from the
campaign on 2026-05-06. All active items are `pending` as of 2026-05-06.
Recipient contacts were re-checked from primary institutional pages and
recent paper footnotes that day. Items where the original draft contact
could not be re-verified carry an inline "TO VERIFY" callout rather than
a guessed address — when those flags are still present, **resolve them
before sending**.

The voice + honesty rewrite pass on 2026-05-06 also (a) replaced the
generic "feedback welcome" closes with per-audience asks pulled from the
`skymap-outreach.md` interview notes, (b) softened the gravitational-wave
framing across `README.md`, the bluesky thread, the r/dataisbeautiful
post, and `email-2-glade-dalya.md`, and (c) added a cross-disciplinary
closing sentence to all four active cold emails.

## Recommended send order

The campaign is a stepped rhythm, not a broadcast. Two priorities shaped
the order: (1) HN and Bluesky generate a real warm-opener that the cold
emails can reference, and (2) cold emails are sequenced by **honesty of
the connection** — emails where skymap has a real functional dependency
on the recipient's work go first, cold ones go last. Reddit's spam
detection flags near-identical content posted to multiple subs
simultaneously, so the three Reddit posts are spaced over 24–48 h with
deliberately different angles.

| Slot | When                | Item                                                    |
| ---- | ------------------- | ------------------------------------------------------- |
| 1    | Tue, 09:30 ET       | [hn-show.md](hn-show.md)                                |
| 2    | Tue, 11:30 ET       | [bluesky-thread.md](bluesky-thread.md)                  |
| 3    | Wed, AM US          | [reddit-r-astronomy.md](reddit-r-astronomy.md)          |
| 4    | Wed, PM US          | [reddit-r-dataisbeautiful.md](reddit-r-dataisbeautiful.md) |
| 5    | Thu                 | [reddit-r-webgpu.md](reddit-r-webgpu.md)                |
| 6    | Thu (after HN lands)| [email-4-cds-aladin.md](email-4-cds-aladin.md) — strongest functional dependency (hips2fits) |
| 7    | Thu                 | [email-1-sdss-outreach.md](email-1-sdss-outreach.md) — DR18 ImgCutout dependency |
| 8    | Fri                 | [email-2-glade-dalya.md](email-2-glade-dalya.md) — honest functional usage of GLADE |
| 9    | Fri (optional)      | [email-3-aas-wwt.md](email-3-aas-wwt.md) — genuinely cold, send last or skip |
| —    | dropped             | ~~[email-5-lvk-em-followup.md](email-5-lvk-em-followup.md)~~ — see notes in file |

_The HN slot deliberately precedes everything: a Show HN thread, even
one that only gets to ~30 points, is a credible warm-opener for every
subsequent cold email. If HN is a dud, drop the "Recent traction on
Hacker News" line from email 3 (AAS WWT) before sending._

_Why CDS goes first among the cold emails: skymap literally would not
work for ~2/3 of its galaxies without `hips2fits`. The dependency is
real and the gratitude is unfaked. SDSS comes second for the same
reason at smaller magnitude (DR18 ImgCutout). GLADE / Dálya is honest
functional usage but no peer-level relationship. AAS WWT is genuinely
cold — the original draft over-claimed familiarity with WWT and has
been rewritten to drop that; if it doesn't get a response, that's
signal that the cold-email shape may be wrong for AAS. LVK / Kasliwal
is dropped entirely — see `email-5-lvk-em-followup.md` for the
reasoning._

## Items at a glance

| Item                            | Target / Recipient                                                | Verified?                  |
| ------------------------------- | ----------------------------------------------------------------- | -------------------------- |
| `hn-show.md`                    | https://news.ycombinator.com/submit                               | yes                        |
| `bluesky-thread.md`             | https://bsky.app (compose dialog on the web)                      | partial — handles flagged  |
| `reddit-r-astronomy.md`         | https://www.reddit.com/r/Astronomy/submit                         | yes (3.1 M members)        |
| `reddit-r-dataisbeautiful.md`   | https://www.reddit.com/r/dataisbeautiful/submit                   | yes (~21–22 M members)     |
| `reddit-r-webgpu.md`            | https://www.reddit.com/r/WebGPU/submit                            | yes (small but on-topic)   |
| `email-1-sdss-outreach.md`      | Niall Deacon, MPIA — `outreach@sdss.org`                          | yes (re-verified)          |
| `email-2-glade-dalya.md`        | Gergely Dálya, Ghent University                                   | partial — TO VERIFY email  |
| `email-3-aas-wwt.md`            | Peter K. G. Williams, CfA / AAS — `peter.williams@aas.org`        | yes (re-verified)          |
| `email-4-cds-aladin.md`         | Thomas Boch + Pierre Fernique, CDS Strasbourg                     | yes (both confirmed)       |
| ~~`email-5-lvk-em-followup.md`~~ | ~~Mansi Kasliwal, Caltech~~ — **dropped from campaign**           | n/a — see file             |

## How to use these files

1. Pick the next-due item from the table above.
2. Open the file, work top-to-bottom: re-read the **Target / Recipient**
   block (re-verify the contact if any "TO VERIFY" callouts remain),
   tick the **Send checklist**, copy-paste the **Subject** + **Body**
   into the appropriate platform, send.
3. Run the **Verification command** if one is given.
4. **Update the file's `Status:` line** to `sent YYYY-MM-DD`. (Don't
   delete the draft — the historical record is part of why this folder
   exists.)
5. Note any reply / engagement in the project memory file at
   `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/outreach_log.md`
   so future sessions can see what landed and what didn't.
