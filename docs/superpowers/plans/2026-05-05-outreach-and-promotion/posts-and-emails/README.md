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

All ten items are in `pending` state on **2026-05-06**. Recipient
contacts were re-checked from primary institutional pages and recent
paper footnotes that day. Items where the original draft contact could
not be re-verified carry an inline "TO VERIFY" callout rather than a
guessed address — when those flags are still present, **resolve them
before sending**.

## Recommended send order

The campaign is a stepped rhythm, not a broadcast. The point of the
order is twofold: (1) HN and Bluesky generate a real warm-opener that
the cold emails can reference, and (2) Reddit's spam detection flags
near-identical content posted to multiple subs simultaneously, so the
three Reddit posts are spaced over 24-48 h with deliberately different
angles.

| Slot | When                | Item                                                    |
| ---- | ------------------- | ------------------------------------------------------- |
| 1    | Tue, 09:30 ET       | [hn-show.md](hn-show.md)                                |
| 2    | Tue, 11:30 ET       | [bluesky-thread.md](bluesky-thread.md)                  |
| 3    | Wed, AM US          | [reddit-r-astronomy.md](reddit-r-astronomy.md)          |
| 4    | Wed, PM US          | [reddit-r-dataisbeautiful.md](reddit-r-dataisbeautiful.md) |
| 5    | Thu                 | [reddit-r-webgpu.md](reddit-r-webgpu.md)                |
| 6    | Thu (after HN lands)| [email-1-sdss-outreach.md](email-1-sdss-outreach.md)    |
| 7    | Fri                 | [email-2-glade-dalya.md](email-2-glade-dalya.md)        |
| 8    | Fri                 | [email-3-aas-wwt.md](email-3-aas-wwt.md)                |
| 9    | following Mon       | [email-4-cds-aladin.md](email-4-cds-aladin.md)          |
| 10   | following Mon       | [email-5-lvk-em-followup.md](email-5-lvk-em-followup.md) |

_The HN slot deliberately precedes everything: a Show HN thread, even
one that only gets to ~30 points, is a credible warm-opener for every
subsequent cold email. If HN is a dud, drop the "Recent traction on
Hacker News" line from email 3 before sending._

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
| `email-5-lvk-em-followup.md`    | Mansi Kasliwal, Caltech — `mansi@astro.caltech.edu`               | yes (publicly listed)      |

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
