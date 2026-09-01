import { prisma } from '../db/index.js';
import { deleteFromStorage, getPublicUrl } from './upload-service.js';
import {
  generateThumbnailStorageKey,
  THUMBNAIL_VERSION,
  THUMBNAIL_WIDTHS,
} from '@isekai/shared/storage';

const STORAGE_DELETE_CONCURRENCY = 20;

export interface FileVariantRecord {
  storageKey: string;
  [key: string]: unknown;
}

export interface FileWithVariants {
  id: string;
  storageKey: string;
  variants?: FileVariantRecord[];
  [key: string]: unknown;
}

/** Keep original file fields stable and add public URLs only at the API boundary. */
export function serializeDeviationFile<T extends FileWithVariants>(file: T) {
  return {
    ...file,
    variants: (file.variants ?? []).map((variant) => ({
      ...variant,
      storageUrl: getPublicUrl(variant.storageKey),
    })),
  };
}

export function serializeDeviationFiles<T extends FileWithVariants>(files: T[] | null | undefined) {
  return (files ?? []).map(serializeDeviationFile);
}

/**
 * Stop active generation, then remove every known derivative before the original.
 * Any storage error aborts the caller's DB cascade so records remain available for retry.
 */
export async function deleteStoredDeviationFiles(files: FileWithVariants[]): Promise<void> {
  if (files.length === 0) return;
  const fileIds = files.map((file) => file.id);

  await prisma.deviationFile.updateMany({
    where: { id: { in: fileIds } },
    data: {
      thumbnailStatus: 'skipped',
      thumbnailLeaseId: null,
      thumbnailLeaseExpiresAt: null,
      thumbnailUpdatedAt: new Date(),
    },
  });

  const variants = await prisma.deviationFileVariant.findMany({
    where: { deviationFileId: { in: fileIds } },
    select: { storageKey: true },
  });
  const keys = [
    ...new Set([
      ...variants.map((variant) => variant.storageKey),
      ...files.flatMap((file) =>
        THUMBNAIL_WIDTHS.map((width) =>
          generateThumbnailStorageKey(file.storageKey, width, THUMBNAIL_VERSION)
        )
      ),
      ...files.map((file) => file.storageKey),
    ]),
  ];
  for (let index = 0; index < keys.length; index += STORAGE_DELETE_CONCURRENCY) {
    await Promise.all(
      keys.slice(index, index + STORAGE_DELETE_CONCURRENCY).map((key) => deleteFromStorage(key))
    );
  }
}
