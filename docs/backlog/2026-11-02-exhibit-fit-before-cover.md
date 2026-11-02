# Exhibit fit runs before its cover registers

**Raised:** 2026-11-02, whole-branch review of the lens shift (#997). The owner ruled to accept it for now.

`exhibitBodySaga` (`src/state/exhibits/exhibitBodySaga.ts:63-72`) computes `sphereFitDistance(fitRadiusMpc,
rt.framing)` when the takeover starts. That is before `ExhibitOverlay` mounts and its notes column (or phone
caption) writes its `viewCover` row. So the fit uses the full canvas, the shift then eases the subject left,
and on desktop windows narrower than about 1.45× their height (e.g. 1200×900) the fitted sphere spills
under the notes. Common 16:9 windows are unaffected: the uncovered area there is still height-limited.

## Fix shape

The exhibit fit has to wait for its own cover before it frames. Two ways to do that:

- race `viewCoverSet` for the exhibit's cover id against a short timeout;
- re-fit the distance once when the cover first lands.

Cinema captures have no covers, so a timeout must not delay them. Either way, a "cover settled" signal
crosses UI → store → saga, which is new machinery. The spec's §9 records the no-re-fit call this item revisits.
