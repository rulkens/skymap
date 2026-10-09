const YEAR_S = 365.25 * 86_400;

/** Sim seconds per wall second as a short speed label: "30 s/s", "4 min/s", "1.2 h/s", "2.5 day/s", "1.4 yr/s". */
export function formatSimRate(simSecPerSec: number): string {
  if (simSecPerSec < 60) return `${Math.max(1, Math.round(simSecPerSec))} s/s`;
  if (simSecPerSec < 3600) return `${Math.round(simSecPerSec / 60)} min/s`;
  if (simSecPerSec < 86_400) return `${(simSecPerSec / 3600).toFixed(1)} h/s`;
  if (simSecPerSec < YEAR_S) return `${(simSecPerSec / 86_400).toFixed(1)} day/s`;
  return `${(simSecPerSec / YEAR_S).toFixed(1)} yr/s`;
}
