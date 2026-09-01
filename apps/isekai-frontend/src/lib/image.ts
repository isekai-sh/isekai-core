export interface LocalImageVariant {
  width: number;
  format?: string | null;
  storageUrl: string;
}

export interface LocalImageSource {
  storageUrl: string;
  variants?: readonly LocalImageVariant[] | null;
}

const FORMAT_PREFERENCE = ['avif', 'webp', 'jpeg', 'jpg', 'png'] as const;

function formatRank(format: string | null | undefined): number {
  const normalized = format?.toLowerCase();
  const rank = FORMAT_PREFERENCE.findIndex((candidate) => candidate === normalized);
  return rank === -1 ? FORMAT_PREFERENCE.length : rank;
}

/**
 * Select the smallest generated variant that is wide enough for the target.
 * If every variant is smaller, use the largest available variant. Older API
 * responses without variants safely fall back to the original storage URL.
 */
export function selectImageVariant(
  source: LocalImageSource | undefined | null,
  targetWidth: number
): string {
  if (!source) return '';

  const variants = (source.variants ?? []).filter(
    (variant) =>
      Number.isFinite(variant.width) &&
      variant.width > 0 &&
      typeof variant.storageUrl === 'string' &&
      variant.storageUrl.length > 0
  );

  if (variants.length === 0 || !Number.isFinite(targetWidth) || targetWidth <= 0) {
    return source.storageUrl;
  }

  const sorted = [...variants].sort((a, b) => {
    const aIsLargeEnough = a.width >= targetWidth;
    const bIsLargeEnough = b.width >= targetWidth;

    if (aIsLargeEnough !== bIsLargeEnough) return aIsLargeEnough ? -1 : 1;
    if (a.width !== b.width) {
      return aIsLargeEnough ? a.width - b.width : b.width - a.width;
    }

    return formatRank(a.format) - formatRank(b.format);
  });

  return sorted[0]?.storageUrl || source.storageUrl;
}

/**
 * Retry a failed generated variant with its original image at most once.
 * The attempted original URL is stored on the element so a broken original
 * cannot cause an error loop, while a reused element may still retry a new
 * file's different original URL.
 */
export function fallbackImageToOriginal(image: HTMLImageElement, originalUrl: string): void {
  if (!originalUrl || image.dataset.originalFallbackUrl === originalUrl) return;

  image.dataset.originalFallbackUrl = originalUrl;
  if (image.getAttribute('src') !== originalUrl) {
    image.src = originalUrl;
  }
}

export const ImageSize = {
  XS: 128, // Table thumbnails (56-64px display)
  SM: 256, // Small grids
  MD: 400, // Medium grids, cards
  LG: 800, // Large previews
  XL: 1200, // Detail views
} as const;
