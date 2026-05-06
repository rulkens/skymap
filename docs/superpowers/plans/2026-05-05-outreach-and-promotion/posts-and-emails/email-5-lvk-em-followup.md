# Email 5 — LIGO-Virgo-KAGRA EM follow-up (GROWTH lead, Mansi Kasliwal)

> **Status: dropped from active campaign — 2026-05-06.**
>
> This email is **not** being sent as part of the v0.2.0 outreach
> campaign. The reasons, recorded so a future revisit doesn't repeat
> the mistake:
>
> 1. **No GW feature exists in skymap.** There is no GW skymap overlay,
>    no probability-volume intersection, no follow-up-triage workflow.
>    Loading GLADE because GLADE was *designed* for GW work is true;
>    pitching skymap as a GW tool is not. The previous draft (preserved
>    below for historical reference) leaned on "the intended workflow"
>    framing which would have introduced asymmetric-information cost
>    with a senior practitioner in a small field.
> 2. **The connection is genuinely cold.** I haven't read the GROWTH /
>    ENGRAVE literature in depth, I'm not in the GW community, and I
>    can't have an informed conversation about follow-up triage from
>    where I'm standing. Cold-emailing into that field without a
>    warm-opener and without a working feature reads as cargo-cult
>    outreach.
> 3. **There is no asymmetric value to send right now.** A reply
>    requires Kasliwal to either (a) explain to a stranger why the
>    pitch doesn't apply, or (b) politely ignore. Both are bad uses
>    of a senior researcher's attention.
>
> **Revisit this file only if** (a) the GW skymap overlay feature
> actually ships and probability-volume intersection works in the
> browser, or (b) someone in the GW follow-up community contacts
> skymap organically — from Show HN, Bluesky, a paper citation, etc.
> Either path turns this from a cold cargo-cult pitch into an
> informed conversation.
>
> The original recipient research and draft body are preserved below
> as historical reference.

---

## Recipient

- **Name:** Prof. Mansi M. Kasliwal
- **Role:** Professor of Astronomy and (since 2025) Director of the Caltech Optical Observatories; Principal Investigator of GROWTH (Global Relay of Observatories Watching Transients Happen), a Caltech-led NSF PIRE network coordinating EM follow-up of GW triggers across 18 telescopes worldwide.
  _(source: https://www.pma.caltech.edu/people/mansi-m-kasliwal and https://growth.caltech.edu/, both retrieved 2026-05-06)_
- **Email:** `mansi@astro.caltech.edu`
  _(source: https://sites.astro.caltech.edu/~mansi/ — her own homepage; cross-checked against https://directory.caltech.edu/personnel/mansi; retrieved 2026-05-06)_

_The original draft suggested either Kasliwal at Caltech **or** an `engrave@ligo.org` address for the ENGRAVE collaboration. A 2026-05-06 search did **not** surface a publicly listed `engrave@ligo.org` (or any equivalent) inbox — the ENGRAVE site at http://www.engrave-eso.org/ does not advertise a coordination email. Going with Kasliwal alone is therefore both better-targeted and the only option that survives verification. If you want a second send to ENGRAVE later, the right move is to identify a current named contact (Andrew J. Levan or Peter G. Jonker, both have spoken on behalf of the collaboration) rather than a generic alias._

> **TO VERIFY — ENGRAVE coordination email.**
>
> The original task-5 draft suggested `engrave@ligo.org` as an alternative recipient. As of 2026-05-06, no such address is listed on the ENGRAVE collaboration's public site (http://www.engrave-eso.org/) or anywhere else findable via web search. **Do not send to a guessed address.** If a parallel pitch to ENGRAVE feels worthwhile after Kasliwal replies (or doesn't), pick a named contact — the chair of ENGRAVE's Governing Council, or the corresponding author on a recent ENGRAVE paper (e.g. Andrew J. Levan at Radboud / Warwick, or Peter G. Jonker at SRON / Radboud) — and verify their institutional address before reaching out.

## Send checklist

- [ ] Confirm `mansi@astro.caltech.edu` still resolves (a refresh of https://sites.astro.caltech.edu/~mansi/ will show it on her contact line).
- [ ] **Hard truthfulness check:** the body is honest about skymap currently having **no** GW skymap overlay. Re-read the body before sending and **do not** add language that implies otherwise — the asymmetric-information cost of overpromising to a senior practitioner in a field this small is enormous.
- [ ] Confirm the DOI resolves: `https://doi.org/10.5281/zenodo.20037028`.
- [ ] Send from `rulkens@gmail.com`.
- [ ] Update this file's `Status:` line to `sent YYYY-MM-DD`.

## Subject

```
Browser 3D explorer for GLADE — GW host-candidate use case, feedback welcome
```

## Body

```
Dear Dr. Kasliwal,

I've built skymap, an open-source browser tool that I think has a
small but real use case in EM-follow-up triage: a 3D interactive
explorer of the GLADE catalog (~2M galaxies after dedup, all-sky),
running directly in Chrome / Edge via WebGPU with no install.

The intended workflow: given a GW localisation contour, you orbit
the GLADE volume, see candidate hosts in 3D, click for redshift +
NED link, get a sense of which structures (clusters, walls) actually
intersect the contour rather than just the projected sky region.

Live: https://skymap.rulkens.com
Source: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.20037028

Important caveats: skymap currently has no GW skymap overlay — that's
a near-term feature I want to add but it's not there yet. I am aware
that real follow-up triage runs through TreasureMap, GW Skynet,
gracedb, and bespoke pipelines. This is meant as a rapid-orientation
companion, not a replacement.

If anyone in your group has a few minutes to look and tell me whether
adding a Multi-Order HEALPix skymap overlay would actually be useful
for triage (vs. people just using treasuremap.space), I'd be very
grateful for the steer.

Best regards,
Alexander Rulkens
rulkens@gmail.com
```

## Verification

- [ ] After hitting send, open the sent-mail folder and confirm the body contains the literal `10.5281/zenodo.20037028` (no `NNNNNNNN`).
- [ ] Confirm the To: header reads `mansi@astro.caltech.edu` exactly — the Caltech Astronomy department uses both `astro.caltech.edu` (her preferred address) and `caltech.edu` (her Directory listing); the `astro` form is the one her personal homepage advertises and is therefore the correct choice.
- [ ] Confirm the body still includes the "no GW skymap overlay" caveat sentence. That sentence is the email's load-bearing honesty disclaimer; deleting it would turn the rest of the pitch into a misrepresentation.

## Status

`dropped 2026-05-06` — see banner at top of file for reasoning.

> Audit pass: 2026-05-06 — Kasliwal address re-verified; ENGRAVE alternative dropped because no public coordination email exists. Voice + honesty pass on the same date dropped this email entirely from the active campaign for the reasons in the top-of-file banner.
