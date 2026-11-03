/** One view of a gallery band: a shot's id in the manifest, and the id of its upright cut for phones where one was taken. */
export type GalleryView = {
  id: string;
  tall?: string;
  /**
   * Where a meteor may now and then cross this view, as fractions of the band's box: open stars, clear of the
   * subject and of the band's words. A view without it gets none.
   */
  sky?: { left: number; top: number; right: number; bottom: number };
};
