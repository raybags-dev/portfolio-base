"use client";
import Link from "next/link";
import { ApiError } from "@/lib/api";

/** Renders a friendly enable-me banner when a module's API is flag-disabled. */
export function ModuleDisabled({ flag }: { flag: string }) {
  return (
    <div className="rounded-theme border border-accent/30 bg-accent/10 p-6">
      <h2 className="font-heading font-semibold mb-1">Module disabled</h2>
      <p className="text-sm text-muted">
        This module is gated by the <code className="text-accent">{flag}</code>{" "}
        feature flag. Enable it in{" "}
        <Link href="/admin/flags" className="text-primary hover:underline">
          Feature Flags
        </Link>{" "}
        to use it.
      </p>
    </div>
  );
}

export function isDisabled(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
