export type ImageInfo = {
  blob: Blob;
  width: number;
  height: number;
  mime: string;
};

/** Bluesky accepts image blobs up to 2 MB; leave a little headroom. */
export const MAX_IMAGE_BYTES = 1_950_000;
/** Plenty for a modern phone camera, and well inside what the appview serves. */
export const MAX_IMAGE_EDGE = 4096;

/** Video limits enforced by Bluesky's video service. */
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024;
export const MAX_VIDEO_SECONDS = 600;

export async function readImageSize(
  file: Blob,
): Promise<{ width: number; height: number }> {
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
}

/**
 * Downscales and re-encodes an image so it fits inside the PDS blob limit.
 * Leaves small files alone so posting stays instant.
 */
export async function prepareImage(
  file: File,
  compress: boolean,
): Promise<ImageInfo> {
  const original = await readImageSize(file);
  const withinLimits =
    file.size <= MAX_IMAGE_BYTES &&
    original.width <= MAX_IMAGE_EDGE &&
    original.height <= MAX_IMAGE_EDGE;
  if (!compress || withinLimits) {
    return {
      blob: file,
      width: original.width,
      height: original.height,
      mime: file.type || "image/jpeg",
    };
  }

  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(original.width, original.height),
  );
  const width = Math.round(original.width * scale);
  const height = Math.round(original.height * scale);

  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return { blob: file, ...original, mime: file.type || "image/jpeg" };
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // Try to keep the detail; only drop quality if the file is still too big.
  for (const quality of [0.95, 0.9, 0.85, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) continue;
    if (blob.size <= MAX_IMAGE_BYTES || quality === 0.5) {
      return { blob, width, height, mime: "image/jpeg" };
    }
  }
  return { blob: file, width, height, mime: file.type || "image/jpeg" };
}

/** Small data URL suitable for sending to a vision model. */
export async function toDataUrl(blob: Blob, maxEdge = 1024): Promise<string> {
  let source: Blob = blob;
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale < 1) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const scaled = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.85),
        );
        if (scaled) source = scaled;
      }
    }
    bitmap.close();
  } catch {
    // Fall back to the original blob.
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(source);
  });
}

export type VideoInfo = {
  width: number;
  height: number;
  duration: number;
};

/** Reads a video's dimensions and length without decoding the whole file. */
export function readVideoInfo(file: File): Promise<VideoInfo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    const done = (info: VideoInfo | null, error?: string) => {
      URL.revokeObjectURL(url);
      if (info) resolve(info);
      else reject(new Error(error ?? "That video could not be read."));
    };
    video.onloadedmetadata = () =>
      done({
        width: video.videoWidth,
        height: video.videoHeight,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
      });
    video.onerror = () => done(null, "That video format is not supported here.");
    video.src = url;
  });
}

/** Returns a human-readable reason the file cannot be posted, or null. */
export function checkVideo(file: File, info: VideoInfo): string | null {
  if (file.size > MAX_VIDEO_BYTES) {
    return `Videos have to be 300 MB or smaller. That one is ${formatBytes(file.size)}.`;
  }
  if (info.duration > MAX_VIDEO_SECONDS + 1) {
    return `Videos have to be 10 minutes or shorter. That one is ${formatDuration(info.duration)}.`;
  }
  return null;
}

export function formatDuration(seconds: number): string {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
