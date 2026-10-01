import { useState } from "react";
import { CircleCheck, CloudUpload, TriangleAlert, X } from "lucide-react";
import { api } from "../api";
import { fmtDate } from "../lib/dates";
import type { CertInfo, SiteRow } from "../types";

function FileInput({
  label,
  file,
  onChange,
  required,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--text-dim)]">{label}</span>
      <input
        type="file"
        required={required}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="input text-xs"
      />
      {file && <span className="text-xs text-[var(--text-dim)]">{file.name}</span>}
    </label>
  );
}

function PreviewRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-[var(--text-dim)]">{label}</span>
      <span
        className={highlight ? "font-medium" : ""}
        style={{ color: highlight ? "#4ade80" : "var(--text-h)" }}
      >
        {value}
      </span>
    </div>
  );
}

export function CertUploadModal({
  site,
  onClose,
  onDeployed,
}: {
  site: SiteRow;
  onClose: () => void;
  onDeployed: () => void;
}) {
  const [certFile, setCertFile] = useState<File | null>(null);
  const [keyFile, setKeyFile] = useState<File | null>(null);
  const [chainFile, setChainFile] = useState<File | null>(null);
  const [step, setStep] = useState<"form" | "preview" | "done">("form");
  const [preview, setPreview] = useState<CertInfo | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function buildFormData() {
    const fd = new FormData();
    if (certFile) fd.append("cert", certFile);
    if (keyFile) fd.append("key", keyFile);
    if (chainFile) fd.append("chain", chainFile);
    return fd;
  }

  async function handlePreview(e: React.FormEvent) {
    e.preventDefault();
    if (!certFile || !keyFile) {
      setError("Нужны файлы сертификата и приватного ключа");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.previewCertUpload(site.id, buildFormData());
      setPreview(res.info);
      setStep("preview");
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await api.confirmCertUpload(site.id, buildFormData());
      setResult(res);
      setStep("done");
      onDeployed();
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
    >
      <div
        className="w-full max-w-md rounded-xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-medium text-[var(--text-h)]">Загрузить сертификат</h2>
          <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text-h)]">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-[var(--text-dim)] mb-4">
          {site.domain} • {site.server_name}
        </p>

        {step === "form" && (
          <form onSubmit={handlePreview} className="flex flex-col gap-3">
            <FileInput label="Сертификат (.crt / .pem)" file={certFile} onChange={setCertFile} required />
            <FileInput label="Приватный ключ (.key)" file={keyFile} onChange={setKeyFile} required />
            <FileInput label="Цепочка (опционально)" file={chainFile} onChange={setChainFile} />
            {error && (
              <div className="text-sm" style={{ color: "#f87171" }}>
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="btn-primary flex items-center justify-center gap-2 mt-2"
            >
              <CloudUpload size={16} /> {busy ? "Проверка..." : "Проверить"}
            </button>
          </form>
        )}

        {step === "preview" && preview && (
          <div className="flex flex-col gap-3">
            <div
              className="rounded-md p-3 text-sm"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
            >
              <PreviewRow label="CN" value={preview.subjectCn ?? "—"} />
              <PreviewRow label="SANs" value={(preview.sans ?? []).join(", ") || "—"} />
              <PreviewRow label="Издатель" value={preview.issuer ?? "—"} />
              <PreviewRow label="Текущий срок" value={fmtDate(site.not_after)} />
              <PreviewRow label="Новый срок" value={fmtDate(preview.notAfter)} highlight />
            </div>
            {error && (
              <div className="text-sm" style={{ color: "#f87171" }}>
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setStep("form")} className="tab flex-1 rounded-md px-3 py-2 text-sm">
                Назад
              </button>
              <button onClick={handleConfirm} disabled={busy} className="btn-primary flex-1">
                {busy ? "Установка..." : "Установить и перезагрузить nginx"}
              </button>
            </div>
          </div>
        )}

        {step === "done" && result && (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            {result.ok ? (
              <CircleCheck size={36} color="#4ade80" />
            ) : (
              <TriangleAlert size={36} color="#f87171" />
            )}
            <p className="text-sm whitespace-pre-wrap">{result.message}</p>
            <button onClick={onClose} className="btn-primary mt-2">
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
