import { Platform } from 'react-native';

const MAX_DIMENSION = 1600;
const COMPRESS_QUALITY = 0.7;
const MAX_BYTES = 5 * 1024 * 1024;

export type CompressResult = {
  uri: string;
  width: number;
  height: number;
  size: number;
  oversize: boolean;
};

export async function compressImage(uri: string): Promise<CompressResult> {
  const head = await fetch(uri);
  const blob = await head.blob();
  const originalSize = blob.size;

  if (originalSize > 20 * 1024 * 1024) {
    throw new Error('File terlalu besar (max 20MB sebelum kompresi). Coba foto ulang atau pilih gambar lain.');
  }

  if (Platform.OS === 'web') {
    return compressOnWeb(blob);
  }

  return compressOnNative(uri);
}

async function compressOnNative(uri: string): Promise<CompressResult> {
  const ImageManipulator = await import('expo-image-manipulator');
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_DIMENSION } }],
    { compress: COMPRESS_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
  );

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

async function compressOnWeb(blob: Blob): Promise<CompressResult> {
  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await loadImage(objectUrl);
    const { width, height } = fitSize(image.naturalWidth, image.naturalHeight, MAX_DIMENSION);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browser tidak mendukung canvas image processing.');
    ctx.drawImage(image, 0, 0, width, height);

    const compressedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (out) => {
          if (!out) {
            reject(new Error('Gagal memproses gambar di browser.'));
            return;
          }
          resolve(out);
        },
        'image/jpeg',
        COMPRESS_QUALITY,
      );
    });

    const compressedUrl = URL.createObjectURL(compressedBlob);
    return {
      uri: compressedUrl,
      width,
      height,
      size: compressedBlob.size,
      oversize: compressedBlob.size > MAX_BYTES,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function fitSize(width: number, height: number, maxDimension: number) {
  if (width <= maxDimension && height <= maxDimension) {
    return { width, height };
  }
  if (width >= height) {
    const ratio = maxDimension / width;
    return { width: maxDimension, height: Math.round(height * ratio) };
  }
  const ratio = maxDimension / height;
  return { width: Math.round(width * ratio), height: maxDimension };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Gagal membaca gambar.'));
    img.src = src;
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
