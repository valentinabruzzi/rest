const MAX_SAFE_PRODUCT_IMAGE_URL_LENGTH = 2048;

export function sanitizeProductImageUrl(imageUrl: string | null | undefined) {
  const value = imageUrl?.trim() ?? "";
  if (!value) return null;
  if (value.startsWith("data:")) return null;
  if (value.length > MAX_SAFE_PRODUCT_IMAGE_URL_LENGTH) return null;
  return value;
}
