import * as ImageManipulator from 'expo-image-manipulator';

const MAX_DIMENSION = 1600; // max width or height (px)
const COMPRESS_QUALITY = 0.7;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB hard limit (post-compression)

export type CompressResult = {
  uri: string;
  width: number;
  height: number;
  size: number;
  /** True kalau hasil masih > MAX_BYTES (caller harus reject upload) */
  oversize: boolean;
};

/**
 * Compress + resize image biar upload cepat & R2 storage hemat.
 * - Resize ke max 1600px sisi terpanjang (preserve aspect ratio)
 * - JPEG quality 0.7 (sweet spot kualitas vs ukuran)
 * - Throw kalau original > 20MB (probably bukan foto, tapi video/raw)
 */
export async function compressImage(uri: string): Promise<CompressResult> {
  const head = await fetch(uri);
  const blob = await head.blob();
  const originalSize = blob.size;

  if (originalSize > 20 * 1024 * 1024) {
    throw new Error('File terlalu besar (max 20MB sebelum kompresi). Coba foto ulang atau pilih gambar lain.');
  }

  // Probe dimension via image manipulator (resize 0 op)
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }], // resize by width; aspect preserved; if portrait this still works (taller stays proportional)
    { compress: COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );

  // Re-fetch compressed file to know size
  const cBlob = await fetch(result.uri).then((r) => r.blob());
  const finalSize = cBlob.size;

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    size: finalSize,
    oversize: finalSize > MAX_BYTES,
  };
}

/** Format bytes ke human-readable (1.2 MB, 450 KB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
