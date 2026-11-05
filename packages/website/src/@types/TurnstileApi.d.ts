/** The two calls ContactForm makes on Cloudflare's Turnstile script (`window.turnstile`). */
export type TurnstileApi = {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
};
