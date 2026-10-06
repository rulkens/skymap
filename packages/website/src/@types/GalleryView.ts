/** One view of a gallery band: a shot's id in the manifest, and the id of its upright cut for phones where one was taken. */
export type GalleryView = {
  id: string;
  tall?: string;
};
