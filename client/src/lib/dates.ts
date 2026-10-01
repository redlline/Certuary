export type ExpiryStatus = "ok" | "warning" | "critical" | "expired" | "unknown";

export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const diff = new Date(iso).getTime() - Date.now();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function expiryStatus(iso: string | null | undefined): ExpiryStatus {
  const days = daysUntil(iso);
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  if (days <= 7) return "critical";
  if (days <= 30) return "warning";
  return "ok";
}

export function fmtDate(iso: string | null | undefined): string {
  return iso
    ? new Date(iso).toLocaleDateString("ru-RU", {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "никогда";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return `${Math.floor(hours / 24)} дн. назад`;
}
