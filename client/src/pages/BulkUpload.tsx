import { useRef, useState } from "react";
import { CircleCheck, CircleX, CloudUpload, TriangleAlert } from "lucide-react";
import { api } from "../api";
import type { BulkDeployResult, BulkMatchResult } from "../types";

export function BulkUploadPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [matches, setMatches] = useState<BulkMatchResult[] | null>(null);
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<BulkDeployResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function buildFormData() {
    const fd = new FormData();
    for (const file of files) fd.append("files", file, file.name);
    return fd;
  }

  async function analyze() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.bulkMatch(buildFormData());
      setMatches(res.results);
      const auto: Record<string, string> = {};
      for (const r of res.results) {
        if (r.valid && r.matches.length === 1) auto[r.groupName] = r.matches[0].siteId;
      }
      setSelections(auto);
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  async function deploy() {
    setBusy(true);
    setError(null);
    try {
      const fd = buildFormData();
      fd.append("selections", JSON.stringify(selections));
      setResults((await api.bulkDeploy(fd)).results);
    } catch (e) {
      setError((e as Error).message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((f) => [...f, ...dropped]);
  }

  const selectedCount = Object.values(selections).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--text-h)]">
          Массовая загрузка сертификатов
        </h1>
        <p className="text-sm text-[var(--text-dim)]">
          Перетащите пары файлов с одинаковым именем (example.com.crt + example.com.key) — система
          сама найдёт подходящий сайт по CN/SAN
        </p>
      </div>

      {!matches && (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInput.current?.click()}
          className="rounded-xl p-10 text-center cursor-pointer"
          style={{ background: "var(--bg-card)", border: "1px dashed var(--border)" }}
        >
          <CloudUpload size={28} className="mx-auto mb-2" style={{ color: "var(--text-dim)" }} />
          <p className="text-sm text-[var(--text-dim)]">
            Перетащите файлы сюда или нажмите для выбора
          </p>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => setFiles((f) => [...f, ...Array.from(e.target.files ?? [])])}
          />
          {files.length > 0 && (
            <div className="mt-4 text-left flex flex-col gap-1">
              {files.map((f, i) => (
                <div key={i} className="text-xs text-[var(--text-h)]">
                  {f.name}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!matches && files.length > 0 && (
        <button onClick={analyze} disabled={busy} className="btn-primary w-fit">
          {busy ? "Анализ..." : "Найти соответствия"}
        </button>
      )}

      {error && (
        <div className="text-sm" style={{ color: "#f87171" }}>
          {error}
        </div>
      )}

      {matches && !results && (
        <div className="flex flex-col gap-3">
          {matches.map((m) => (
            <div
              key={m.groupName}
              className="rounded-lg p-4"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-2 mb-2">
                {m.valid ? (
                  <CircleCheck size={15} color="#4ade80" />
                ) : (
                  <CircleX size={15} color="#f87171" />
                )}
                <span className="text-sm font-medium text-[var(--text-h)]">{m.groupName}</span>
                {m.info?.subjectCn && (
                  <span className="text-xs text-[var(--text-dim)]">CN: {m.info.subjectCn}</span>
                )}
              </div>
              {!m.valid && (
                <p className="text-xs" style={{ color: "#f87171" }}>
                  {m.reason}
                </p>
              )}
              {m.valid && m.matches.length === 0 && (
                <p className="text-xs flex items-center gap-1" style={{ color: "#facc15" }}>
                  <TriangleAlert size={12} /> Не найдено подходящих сайтов по CN/SAN — загрузите
                  вручную через карточку сервера
                </p>
              )}
              {m.valid && m.matches.length > 0 && (
                <select
                  className="input text-xs"
                  value={selections[m.groupName] ?? ""}
                  onChange={(e) => setSelections({ ...selections, [m.groupName]: e.target.value })}
                >
                  <option value="">— не загружать —</option>
                  {m.matches.map((match) => (
                    <option key={match.siteId} value={match.siteId}>
                      {match.domain} ({match.serverName})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setMatches(null);
                setFiles([]);
              }}
              className="tab rounded-md px-4 py-2 text-sm"
            >
              Назад
            </button>
            <button onClick={deploy} disabled={busy || selectedCount === 0} className="btn-primary">
              {busy ? "Установка..." : `Установить (${selectedCount})`}
            </button>
          </div>
        </div>
      )}

      {results && (
        <div className="flex flex-col gap-2">
          {results.map((r, i) => (
            <div
              key={i}
              className="rounded-lg p-3 text-sm flex items-center gap-2"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: r.ok ? "#4ade80" : "#f87171",
              }}
            >
              {r.ok ? <CircleCheck size={14} /> : <CircleX size={14} />}
              {r.groupName}: {r.message}
            </div>
          ))}
          <button
            onClick={() => {
              setMatches(null);
              setResults(null);
              setFiles([]);
              setSelections({});
            }}
            className="btn-primary w-fit"
          >
            Готово
          </button>
        </div>
      )}
    </div>
  );
}
