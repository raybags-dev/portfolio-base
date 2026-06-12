"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/store";
import { useToast } from "@/components/admin/Toast";
import { getUDEStorageStats, clearUDES3, clearUDEMongoDB } from "@/lib/api";

interface Stats {
  s3_blob_count: number;
  mongodb_doc_count: number;
  postgres_session_count: number;
}

export default function StorageAdminPage() {
  const token = useAuth((s) => s.token)!;
  const toast = useToast();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [s3Clearing, setS3Clearing] = useState(false);
  const [mongoClear, setMongoClear] = useState(false);

  async function refresh() {
    try {
      setLoading(true);
      const s = await getUDEStorageStats();
      setStats(s);
    } catch (e) {
      toast.error("Failed to load storage stats", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleClearS3() {
    if (!confirm("Delete ALL UDE blobs from S3? This cannot be undone.")) return;
    setS3Clearing(true);
    try {
      const r = await clearUDES3(token);
      toast.success(r.message);
      await refresh();
    } catch (e) {
      toast.error("Failed to clear S3", e);
    } finally {
      setS3Clearing(false);
    }
  }

  async function handleClearMongo() {
    if (!confirm("Drop all UDE collections from MongoDB? This cannot be undone.")) return;
    setMongoClear(true);
    try {
      const r = await clearUDEMongoDB(token);
      toast.success(r.message);
      await refresh();
    } catch (e) {
      toast.error("Failed to clear MongoDB", e);
    } finally {
      setMongoClear(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-heading font-bold text-2xl">Storage Management</h1>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-sm border border-white/15 rounded-theme px-3 py-1.5 hover:bg-surface/60 disabled:opacity-50"
        >
          {loading ? "Loading…" : "↻ Refresh"}
        </button>
      </div>

      <p className="text-sm text-muted mb-6">
        Manage raw blob storage (S3) and structured document storage (MongoDB) for the Universal Data Extractor.
        Deleting blobs here does not remove PostgreSQL session records.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Postgres Sessions", value: stats?.postgres_session_count ?? "—", color: "text-blue-400" },
          { label: "S3 Blobs", value: stats?.s3_blob_count ?? "—", color: "text-emerald-400" },
          { label: "MongoDB Docs", value: stats?.mongodb_doc_count ?? "—", color: "text-amber-400" },
        ].map((s) => (
          <div key={s.label} className="rounded-theme bg-surface border border-white/10 p-4 text-center">
            <div className={`text-3xl font-bold ${s.color}`}>{loading ? "…" : s.value.toLocaleString()}</div>
            <div className="text-xs text-muted mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* S3 management */}
      <div className="rounded-theme border border-white/10 bg-surface p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">S3 Blob Storage</h2>
            <p className="text-sm text-muted mt-1">
              Raw extracted content (HTML, JSON, CSV) saved before processing.
              Bucket: <code className="font-mono text-xs">raybags-s3-bucket_blob_storage</code>
            </p>
            <p className="text-sm text-muted mt-1">
              <strong className="text-foreground">{loading ? "…" : (stats?.s3_blob_count ?? 0).toLocaleString()}</strong> blobs stored under <code className="font-mono text-xs">ude/</code> prefix.
            </p>
          </div>
          <button
            onClick={handleClearS3}
            disabled={s3Clearing || loading}
            className="flex-shrink-0 rounded-theme px-4 py-2 text-sm border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-50 whitespace-nowrap"
          >
            {s3Clearing ? "Deleting…" : "Clear S3 Blobs"}
          </button>
        </div>
      </div>

      {/* MongoDB management */}
      <div className="rounded-theme border border-white/10 bg-surface p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">MongoDB Document Store</h2>
            <p className="text-sm text-muted mt-1">
              Normalised structured records stored after analytics. Database:{" "}
              <code className="font-mono text-xs">raybags_ude</code>. Each session gets a collection
              named <code className="font-mono text-xs">ude_session_N</code>.
            </p>
            <p className="text-sm text-muted mt-1">
              <strong className="text-foreground">{loading ? "…" : (stats?.mongodb_doc_count ?? 0).toLocaleString()}</strong> documents across all session collections.
            </p>
          </div>
          <button
            onClick={handleClearMongo}
            disabled={mongoClear || loading}
            className="flex-shrink-0 rounded-theme px-4 py-2 text-sm border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-50 whitespace-nowrap"
          >
            {mongoClear ? "Dropping…" : "Clear MongoDB"}
          </button>
        </div>
      </div>
    </div>
  );
}
