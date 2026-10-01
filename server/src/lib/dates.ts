export function daysUntil(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const diff = new Date(dateIso).getTime() - Date.now();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
