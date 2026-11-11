/** A ruler tick's label: seconds below a minute (`2.5`, the first label `30 s`), `m:ss` from a minute on (`1:30`, `1:30.5`), as the playhead reads. */
const SEC_PER_MIN = 60;

export function formatTickLabel(sec: number, withUnit: boolean): string {
  const rounded = +sec.toFixed(3);
  if (rounded < SEC_PER_MIN) return `${rounded}${withUnit ? ' s' : ''}`;
  const minutes = Math.floor(rounded / SEC_PER_MIN);
  const [whole = '0', fraction] = String(+(rounded - minutes * SEC_PER_MIN).toFixed(3)).split('.');
  return `${minutes}:${whole.padStart(2, '0')}${fraction === undefined ? '' : `.${fraction}`}`;
}
