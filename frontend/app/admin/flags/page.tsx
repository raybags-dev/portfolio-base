"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listFlags, toggleFlag } from "@/lib/api";
import { useAuth } from "@/lib/store";
import type { FeatureFlag } from "@/lib/types";

export default function FlagsPage() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data: flags = [] } = useQuery({
    queryKey: ["flags"],
    queryFn: () => listFlags(token),
    enabled: !!token,
  });

  const mutate = useMutation({
    mutationFn: (key: string) => toggleFlag(token, key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flags"] });
      qc.invalidateQueries({ queryKey: ["bootstrap"] });
    },
  });

  const groups = flags.reduce<Record<string, FeatureFlag[]>>((acc, f) => {
    (acc[f.group] ||= []).push(f);
    return acc;
  }, {});

  return (
    <div>
      <h1 className="font-heading font-bold text-2xl mb-6">Feature Flags</h1>
      {Object.entries(groups).map(([group, items]) => (
        <section key={group} className="mb-8">
          <h2 className="text-secondary font-semibold mb-3 capitalize">{group}</h2>
          <div className="space-y-2">
            {items.map((f) => (
              <div
                key={f.key}
                className="flex items-center justify-between rounded-theme bg-surface border border-white/10 px-4 py-3"
              >
                <div>
                  <div className="font-medium">{f.label || f.key}</div>
                  {f.description && (
                    <div className="text-xs text-muted">{f.description}</div>
                  )}
                </div>
                <button
                  onClick={() => mutate.mutate(f.key)}
                  aria-pressed={f.enabled}
                  className={`relative h-6 w-11 rounded-full transition-colors ${
                    f.enabled ? "bg-primary" : "bg-white/20"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                      f.enabled ? "translate-x-5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
