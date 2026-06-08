"use client";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { uploadMedia, listMedia } from "@/lib/api";
import { useAuth } from "@/lib/store";
import { Modal } from "@/components/ui/Modal";
import type { MediaAsset } from "@/lib/types";

/** URL field + Upload button + Library picker. Uploads go to the DB-backed
 *  media API; the Library lets you reuse previously uploaded images. */
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
  const [libraryOpen, setLibraryOpen] = useState(false);

  const { data: media = [] } = useQuery<MediaAsset[]>({
    queryKey: ["media"],
    queryFn: () => listMedia(token!),
    enabled: libraryOpen && !!token,
    staleTime: 30_000,
  });

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

  function pickFromLibrary(asset: MediaAsset) {
    onChange(asset.url);
    setLibraryOpen(false);
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
        {token && (
          <button
            type="button"
            onClick={() => setLibraryOpen(true)}
            className="rounded-theme border border-white/15 px-3 py-2 text-sm whitespace-nowrap hover:border-primary/60 hover:text-primary transition-colors"
          >
            Library
          </button>
        )}
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
        <div className="mt-2 relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="preview" className="h-16 rounded-theme object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            title="Remove image"
            className="absolute -top-2 -right-2 w-5 h-5 flex items-center justify-center rounded-full bg-surface border border-white/20 text-muted hover:text-red-400 hover:border-red-400/60 text-xs transition-colors leading-none"
          >
            ×
          </button>
        </div>
      )}

      <Modal open={libraryOpen} onClose={() => setLibraryOpen(false)}>
        <h2 className="font-heading font-semibold text-lg mb-4">Media Library</h2>
        {media.length === 0 ? (
          <p className="text-muted text-sm">No images uploaded yet. Use the Upload button to add one.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-1">
            {media.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => pickFromLibrary(asset)}
                className="group relative rounded-theme overflow-hidden border border-white/10 hover:border-primary/60 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={asset.url}
                  alt={asset.filename}
                  className="w-full h-24 object-cover group-hover:opacity-80 transition-opacity"
                />
                <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-xs text-muted truncate">
                  {asset.filename}
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
