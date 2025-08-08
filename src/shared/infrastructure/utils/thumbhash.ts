import { rgbaToThumbHash } from "thumbhash";

/**
 * Generate a thumbhash (base64 encoded) from an image File.
 * Uses canvas to extract pixel data in the browser environment.
 */
export async function generateThumbhash(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context not available");
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  const hash = rgbaToThumbHash(bitmap.width, bitmap.height, imageData.data);
  let binary = "";
  hash.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}
