/** The one CPU buffer a pyramid load holds (spike: 10.46 MB at peak with the reader's chunk in
 *  flight). */
export const VOLUME_UPLOAD_SLAB_BYTES = 8 * 1024 * 1024;
