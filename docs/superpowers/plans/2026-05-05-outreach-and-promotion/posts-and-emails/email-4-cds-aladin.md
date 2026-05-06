# Email 4 — CDS Strasbourg / Aladin team (Thomas Boch + Pierre Fernique)

## Recipients

- **Name:** Thomas Boch
  - **Role:** Ingénieur de Recherche at CDS, technical lead of the Aladin project (which includes Aladin Lite and the hips2fits service skymap depends on).
    _(source: https://astro.unistra.fr/en/research/thomas-boch/, retrieved 2026-05-06; also https://cds.unistra.fr/news/2025/12/02-aladin-lite-prize/ — Aladin Lite won the 2025 French Open Science Award for research open software, with Boch credited as technical lead.)_
  - **Email:** `thomas.boch@astro.unistra.fr`
    _(source: https://astro.unistra.fr/en/research/thomas-boch/ — listed with anti-spam de-obfuscation as `thomas.boch@-Code to remove to avoid SPAM-astro.unistra.fr`; the working address is the form below; retrieved 2026-05-06)_
  - **Phone (only if email bounces and a follow-up is genuinely warranted):** +33 3 68 85 24 42

- **Name:** Pierre Fernique
  - **Role:** Ingénieur de Recherche at CDS; one of the principal authors of the Aladin Sky Atlas desktop client and a long-time core developer.
    _(source: https://astro.unistra.fr/en/research/pierre-fernique/ and https://cds.unistra.fr/~fernique/ — both retrieved 2026-05-06)_
  - **Email:** `pierre.fernique@astro.unistra.fr`
    _(source: https://astro.unistra.fr/en/research/pierre-fernique/ — same anti-spam de-obfuscation pattern as Boch's page; retrieved 2026-05-06)_

- **General CDS / Aladin inbox (CC if you want collaboration leadership awareness):** `cds-question@unistra.fr`
  _(source: Aladin User Manual + https://aladin.cds.unistra.fr/ contact pointer; retrieved 2026-05-06; this is the right address for "is there a place for skymap in the CDS community-tools listing?" if a routed-to-the-right-person answer matters more than reaching Boch / Fernique personally)_

_The original draft listed both Boch and Fernique with the same `astro.unistra.fr` addresses. Both addresses re-verified independently from the Strasbourg Observatory team pages on 2026-05-06; no change to the To: line. Adding `cds-question@unistra.fr` as an optional CC is new — useful if you'd like the awareness to land in CDS's general intake even if both individual recipients happen to be on holiday._

## Send checklist

- [ ] Confirm both `astro.unistra.fr` addresses still resolve (a quick refresh of the two profile pages above is the cheapest check).
- [ ] Decide whether to CC `cds-question@unistra.fr`. Default: do not CC — the email is a collegial heads-up, not a support ticket; the CC adds noise. Reconsider only if both individual addresses bounce.
- [ ] Confirm the DOI in the body resolves: `https://doi.org/10.5281/zenodo.20037028`.
- [ ] Send from `rulkens@gmail.com`.
- [ ] Update this file's `Status:` line to `sent YYYY-MM-DD`.

## Subject

```
Skymap — a WebGPU 3D viewer using hips2fits; awareness + interop?
```

## Body

```
Dear Thomas and Pierre,

I'm an independent designer-engineer based in the Netherlands. Day
job is building Repper (https://repper.app), a pattern-design tool;
skymap is an open-source side project — a browser-based 3D explorer
for SDSS, 2MRS, and GLADE galaxy catalogs, built on WebGPU.

I'm writing primarily to say thank you. For 2MRS and GLADE galaxies
(roughly two thirds of what skymap loads), the obvious thumbnail
source is the Digitized Sky Survey at ESO — but ESO's DSS endpoint
doesn't expose CORS headers, so a browser fetch is rejected on
cross-origin grounds. Full stop, no workaround browser-side. The
project's entire thumbnail story for non-SDSS galaxies depends on
your hips2fits service routing around that — and that single piece
of infrastructure is the difference between "this works in a browser"
and "this needs a backend." Genuinely thank you.

Live: https://skymap.rulkens.com
Source + acknowledgements: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.20037028

Two questions, no hurry on either:

1. Is there a CDS-maintained listing of community tools that build on
   VizieR / hips2fits / Aladin Lite where skymap might fit? Awareness
   among the CDS user community would be valuable; I'd accept a
   "thanks but no" gracefully.
2. If I added VOTable export of the current selection or a hips2fits
   "open this region in Aladin Lite" deep-link, would either be
   actually useful to your users, or just clutter? I'm genuinely
   unsure of the priority — I haven't used Aladin desktop, so I can't
   tell from the user side.

Honest caveats: I'm not a scientist (designer-engineer at the seam
of art / engineering / science). I can't fully verify the cosmology
and catalog math from where I'm standing — that's part of why I'm
reaching out. Plenty of unpolished UX edges too; if anything trips
your community up, I'd love to hear which thing first.

If you know other people working at this art / engineering / science
seam — astronomers building tools, designers working with science
data, anyone whose project lives between disciplines — I'd genuinely
value the introduction.

With thanks for CDS,
Alexander Rulkens
rulkens@gmail.com
```

## Verification

- [ ] After hitting send, open the sent-mail folder and confirm the body contains the literal `10.5281/zenodo.20037028` (no `NNNNNNNN`, no version-specific DOI variants).
- [ ] Confirm the To: header reads `thomas.boch@astro.unistra.fr` and `pierre.fernique@astro.unistra.fr` exactly — `unistra.fr` (not `u-strasbg.fr`) is the canonical current domain; the legacy `u-strasbg.fr` form may still forward but is no longer the address either profile page advertises.
- [ ] If a reply from either of them mentions Aladin Lite v3 / OSSR specifically, file a follow-up note in `outreach_log.md` — the OSSR (Open Source Software Repository) listing is the most concrete possible answer to question 1.

## Status

`pending`

> Audit pass: 2026-05-06 — both addresses re-verified from the Strasbourg Observatory team pages.
