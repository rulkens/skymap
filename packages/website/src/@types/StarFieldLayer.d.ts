/** One distance bin of the page's sky: its stars' median distance, and where its stars end in the field's arrays. */
export type StarFieldLayer = {
  distancePc: number;
  /** One past this layer's last star; a layer starts where the one before it ends. */
  end: number;
};
