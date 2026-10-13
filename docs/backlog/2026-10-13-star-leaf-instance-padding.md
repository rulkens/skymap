# Star leaf lists pad each leaf to 8 instances

**Readiness:** `deferred`. **Surfaced:** 2026-10-12, phone GPU pass on #885.

## Problem

Leaf lists are written in blocks of 8 (`LEAF_BLOCK_SHIFT` 3), so the cut draws more instances than there are records:
earth-surface 368 k for 337 k records, star-field 578 k for 511 k, milky-way 172 k for 32 k (1.46 k blobs).

## Measured

One entry per record (shift 0) reached 336 k / 511 k / 32 k, but on the phone `star-cut-compute` went 2.0 to 3.3 ms
at Earth (emit writes ~336 k entries against ~46 k) and the frame median did not move; it was reverted. Leaf-list
memory at medium: shift 3 is 3.15 MB, 2 is 5.25, 1 is 9.46, 0 is 16.8 (large: 6.3 / 10.5 / 18.9 / 33.6).

## Option

Only the milky-way pose pays for the padding, and the phone draws no stars there. Revisit if a far-view pose draws
stars on a phone, or pad per record class rather than per block.
