export function isSafeId(id: string): boolean {
  if (!id) return false;
  if (id.includes('/') || id.includes('\\') || id.includes('..')) return false;
  if (id.startsWith('.')) return false;
  return true;
}
