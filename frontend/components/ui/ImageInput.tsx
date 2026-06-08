"use client";
import { useRef, useState } from "react";
import { uploadMedia } from "@/lib/api";
import { useAuth } from "@/lib/store";

/** URL field + "Upload" button. Uploads go to the DB-backed media API and the
 *  returned URL is written back. Shows a small preview. */
export function ImageInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}) {
  const token = useAuth((s) => s.token);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f || !token) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await uploadMedia(token, f);
      onChange(r.url);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div>
      {label && <span className="text-sm">{label}</span>}
      <div className="flex gap-2 mt-1">
        <input
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://…  or upload →"
          className="flex-1 rounded-theme bg-bg border border-white/15 px-3 py-2"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy || !token}
          className="rounded-theme border border-white/15 px-3 py-2 text-sm whitespace-nowrap disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onFile}
          className="hidden"
        />
      </div>
      {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="preview" className="mt-2 h-16 rounded-theme object-cover" />
      )}
    </div>
  );
}
