/** HorizonBakeReply — a bake worker's answer to one `HorizonBakeTask`. */
export type HorizonBakeReply =
  | { readonly kind: 'flat' | 'image'; readonly error?: undefined }
  | { readonly kind?: undefined; readonly error: string };
