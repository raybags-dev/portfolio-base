"use client";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { uploadMedia, listMedia, deleteMedia } from "@/lib/api";
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
  const qc = useQueryClient();
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

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMedia(token!, id),
    onSuccess: (_data, id) => {
      qc.setQueryData<MediaAsset[]>(["media"], (prev = []) =>
        prev.filter((a) => a.id !== id)
      );
      // If the deleted asset was currently selected, clear it
      const deleted = media.find((a) => a.id === id);
      if (deleted && deleted.url === value) onChange("");
    },
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
            {media.map((asset) => {
              const isActive = asset.url === value;
              const isDeleting = deleteMutation.isPending && deleteMutation.variables === asset.id;
              return (
                <div
                  key={asset.id}
                  className={`group relative rounded-theme overflow-hidden border transition-all ${
                    isActive
                      ? "border-primary ring-1 ring-primary/50"
                      : "border-white/10 hover:border-primary/60"
                  }`}
                >
                  {/* Click anywhere on image to select */}
                  <button
                    type="button"
                    onClick={() => pickFromLibrary(asset)}
                    className="block w-full"
                    aria-label={`Select ${asset.filename}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={asset.url}
                      alt={asset.filename}
                      className={`w-full h-24 object-cover transition-all ${
                        isDeleting ? "opacity-30" : isActive ? "opacity-100" : "grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-90"
                      }`}
                    />
                    <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-0.5 text-xs text-muted truncate text-left">
                      {asset.filename}
                    </div>
                  </button>

                  {/* Selected indicator */}
                  {isActive && !isDeleting && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold leading-none pointer-events-none">
                      ✓
                    </div>
                  )}

                  {/* Delete bin — top-left, visible on hover */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(asset.id);
                    }}
                    disabled={isDeleting}
                    title="Delete image"
                    className="absolute top-1.5 left-1.5 w-6 h-6 rounded-md bg-black/70 border border-white/20 text-white/60 hover:text-red-400 hover:border-red-400/60 hover:bg-black/90 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100 disabled:cursor-not-allowed"
                    aria-label={`Delete ${asset.filename}`}
                  >
                    {isDeleting ? (
                      <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
