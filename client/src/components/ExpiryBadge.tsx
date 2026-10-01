import { daysUntil, expiryStatus, type ExpiryStatus } from "../lib/dates";

const STATUS_STYLES: Record<ExpiryStatus, { bg: string; text: string; border: string; label: string }> = {
  ok: {
    bg: "rgba(34,197,94,0.12)",
    text: "#4ade80",
    border: "rgba(34,197,94,0.35)",
    label: "OK",
  },
  warning: {
    bg: "rgba(234,179,8,0.12)",
    text: "#facc15",
    border: "rgba(234,179,8,0.35)",
    label: "Скоро истекает",
  },
  critical: {
    bg: "rgba(239,68,68,0.12)",
    text: "#f87171",
    border: "rgba(239,68,68,0.35)",
    label: "Критично",
  },
  expired: {
    bg: "rgba(239,68,68,0.2)",
    text: "#fca5a5",
    border: "rgba(239,68,68,0.5)",
    label: "Истёк",
  },
  unknown: {
    bg: "rgba(107,114,128,0.12)",
    text: "#9ca3af",
    border: "rgba(107,114,128,0.35)",
    label: "Неизвестно",
  },
};

export function ExpiryBadge({ notAfter }: { notAfter: string | null | undefined }) {
  const status = expiryStatus(notAfter);
  const styles = STATUS_STYLES[status];
  const days = daysUntil(notAfter);
  let label = styles.label;
  if (status !== "unknown") {
    label = status === "expired" ? `Истёк ${Math.abs(days ?? 0)} дн. назад` : `${days} дн.`;
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ background: styles.bg, color: styles.text, border: `1px solid ${styles.border}` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: styles.text }} />
      {label}
    </span>
  );
}
