export function generateOrderNumber(): string {
  const part = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${part}-${rand}`;
}
