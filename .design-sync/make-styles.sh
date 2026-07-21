#!/usr/bin/env bash
# Regenerate .design-sync/dist/styles-combined.css — the cfg.cssEntry the
# converter appends into _ds_bundle.css (and thus the styles.css closure).
#
# Order matters: the display-font @import must lead, then the design tokens
# (:root) from global.css, then the Vite-extracted component CSS, then two
# preview-only overrides. Run after `vite build --config vite.bundle.config.ts`.
set -euo pipefail
cd "$(dirname "$0")/.."   # repo root

OUT=.design-sync/dist/styles-combined.css
{
  echo '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600&display=swap");'
  cat src/styles/global.css .design-sync/dist/skymap.css
  cat <<'CSS'

/* ── design-sync preview-only overrides ────────────────────────────────────
 * Scoped to .ds-preview-frame / .ds-grid / .ds-cell — classes the converter's
 * preview harness emits, which real designs built with these components never
 * carry. So none of this leaks into a shipped design. */

/* InfoCard is a position:fixed HUD; de-fix it inside a preview cell so column
 * cards don't escape their grid cell. */
.ds-preview-frame [class*="infoCardStack"],
.ds-preview-frame [class*="infoCardFull"] {
  position: static !important;
  inset: auto !important;
  top: auto !important;
  right: auto !important;
}

/* skymap's HUD is designed for a dark scene. The preview harness sets a white
 * page + light cell chrome; darken both so the translucent glass panels read. */
body:has(.ds-grid),
body:has(.ds-single),
body:has([data-ds-fallback]) {
  background: #04060d !important;
}
.ds-cell {
  background: radial-gradient(120% 120% at 70% 20%, #0b1022 0%, #04060d 70%) !important;
  border-color: rgba(130, 160, 220, 0.2) !important;
}
.ds-cell > h4 {
  color: var(--color-fg-muted) !important;
}
CSS
} > "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT" | tr -d ' ') bytes)"
