// The footer's light line, made live: imported by layouts/Base.astro's script, once per page.
import { lightSinceLine } from '../../utils/lightSinceLine.ts';
import { liveLine } from '../../utils/liveLine.ts';

const line = document.querySelector<HTMLElement>('[data-light]');
if (line) liveLine(line, () => lightSinceLine(performance.now() / 1000));
