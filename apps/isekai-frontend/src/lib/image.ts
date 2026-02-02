/**
 * Generate optimized image URL with resize parameters.
 *
 * When served through vault-proxy, these params trigger server-side resizing.
 * When served directly from R2/S3, params are ignored (graceful degradation).
 */
export function thumb(
  url: string | undefined | null,
  width: number = 400,
  options?: {
    format?: 'webp' | 'jpeg' | 'png';
    quality?: number;
  }
): string {
  if (!url) return '';

  const params = new URLSearchParams();
  params.set('w', width.toString());

  if (options?.format) {
    params.set('f', options.format);
  }
  if (options?.quality) {
    params.set('q', options.quality.toString());
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}${params.toString()}`;
}

export const ImageSize = {
  XS: 128, // Table thumbnails (56-64px display)
  SM: 256, // Small grids
  MD: 400, // Medium grids, cards
  LG: 800, // Large previews
  XL: 1200, // Detail views
} as const;
