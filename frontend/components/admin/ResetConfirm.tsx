"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/admin/Toast";

/**
 * Two-step "Reset to defaults" button. First click reveals inline confirmation;
 * second click fires the reset. Invalidates provided query keys on success.
 */
export function ResetConfirm({
  label = "Reset to defaults",
  onReset,
  invalidateKeys = [],
}: {
  label?: string;
  onReset: () => Promise<unknown>;
  invalidateKeys?: string[][];
}) {
  const [confirming, setConfirming] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  const mut = useMutation({
    mutationFn: onReset,
    onSuccess: () => {
      setConfirming(false);
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      toast.success("Reset to defaults");
    },
    onError: (e: unknown) =>
      toast.error("Reset failed", e instanceof Error ? e : undefined),
  });

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-theme border border-white/15 px-4 py-2 text-sm text-muted hover:border-red-400/60 hover:text-red-400 transition-colors"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted">This will wipe all changes. Sure?</span>
      <button
        type="button"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
        className="rounded-theme border border-red-400/70 text-red-400 px-4 py-2 text-sm hover:bg-red-400/10 disabled:opacity-50 transition-colors"
      >
        {mut.isPending ? "Resetting…" : "Yes, reset"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="rounded-theme border border-white/15 px-4 py-2 text-sm text-muted hover:border-white/30 transition-colors"
      >
        Cancel
      </button>
    </div>
  );
}
