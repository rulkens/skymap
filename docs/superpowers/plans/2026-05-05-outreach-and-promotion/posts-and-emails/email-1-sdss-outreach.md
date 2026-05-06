# Email 1 — SDSS outreach team

## Recipient

- **Name:** Niall Deacon (Education and Public Outreach Coordinator, SDSS-V)
- **Affiliation:** Center for Astronomy Education and Outreach, Haus der Astronomie / Max-Planck-Institut für Astronomie, Heidelberg
  _(source: https://www.mpia.de/institute/staff/32759, retrieved 2026-05-06)_
- **Primary email:** `outreach@sdss.org`
  _(source: https://www.sdss.org/contact-us/ and https://www.sdss.org/collaboration/key-people/ — re-verified 2026-05-06; this is the canonical SDSS outreach inbox and currently routes to Niall Deacon)_
- **Direct backup email (if `outreach@sdss.org` bounces):** `deacon@mpia.de`
  _(source: https://www.mpia.de/institute/staff/32759 staff page; also listed in the SDSS DR19 paper author affiliations on arxiv.org/abs/2507.07093, retrieved 2026-05-06)_

_The original draft cited `outreach@sdss.org` with a TODO to verify the SDSS web team. The address is correct and is the right channel — it goes to the EPO Coordinator, not a generic webmaster — so the salutation is to the team rather than to Deacon by name, which keeps the email gracefully forwardable inside SDSS if the role rotates._

## Send checklist

- [ ] Confirm `outreach@sdss.org` is still the live address (a quick `https://www.sdss.org/contact-us/` fetch will show it). If the page no longer lists it, fall back to `deacon@mpia.de` and adjust the salutation to "Dear Dr. Deacon,".
- [ ] If Show HN landed (≥ 30 points or front-page time), add a one-line traction reference to the second paragraph. If HN was a dud, leave the paragraph alone — never invent traction.
- [ ] Confirm the DOI in the body resolves: `https://doi.org/10.5281/zenodo.20037028` should land on the Zenodo concept record.
- [ ] Send from `rulkens@gmail.com` (CITATION.cff attribution and DOI metadata both list this address — consistency matters).
- [ ] Update this file's `Status:` line to `sent YYYY-MM-DD`.

## Subject

```
Browser-based WebGPU 3D explorer for SDSS DR18 — feedback welcome
```

## Body

```
Dear SDSS Outreach team,

I'm writing as an independent developer with a small project that uses
SDSS DR18 data and that I hope might be useful to your education /
public-outreach work. I've built skymap, a free browser-based 3D
explorer that loads SDSS, 2MRS, and GLADE galaxy catalogs and lets
users orbit the cosmic-web wedge in real time. It runs on WebGPU
(Chrome / Edge 113+, Firefox 141+, Safari 26+) with no install, no
Python.

For SDSS galaxies, the on-zoom thumbnail is fetched from your DR18
ImgCutout endpoint (which exposes CORS headers — thank you for that).
Spectroscopic redshift and photometric magnitudes are pulled directly
from your SkyServer SQL output. Citation and attribution are listed
prominently in the README and in the project's CITATION.cff.

Live: https://skymap.rulkens.com
Source + acknowledgements: https://github.com/rulkens/skymap
DOI: https://doi.org/10.5281/zenodo.20037028

Two specific questions, if you have time:

1. Is there an SDSS Voyages page or classroom-resource list where a
   tool like this would fit naturally? I'd value being suggested as a
   complement to the existing 2D sky viewers.
2. Any data-attribution language I should be using that I'm not?

Happy to incorporate feedback, and equally happy to hear "no thanks".

Best regards,
Alexander Rulkens
rulkens@gmail.com
```

## Verification

- [ ] After hitting send, open the sent-mail folder and confirm the body contains the literal `10.5281/zenodo.20037028` (no `NNNNNNNN`, no `1228374974` — both have appeared in stale drafts).
- [ ] Confirm the To: header reads `outreach@sdss.org` (a typo to `outreach@sdss.com` would silently bounce or — worse — land in someone else's mailbox).

## Status

`pending`

> Audit pass: 2026-05-06 — `outreach@sdss.org` re-confirmed as the canonical SDSS EPO inbox (Niall Deacon, MPIA); DOI `10.5281/zenodo.20037028` matches the Zenodo concept record and the README badge.

