"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/store";

const CHAT_API = "/chat/api/v1";

type Category = "hard_block" | "soft_redirect" | "topic_scope" | "injection_defense";

interface Guardrail {
  id: number;
  category: Category;
  rule: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const CATEGORY_META: Record<Category, { label: string; color: string }> = {
  hard_block: { label: "Hard Block", color: "bg-rose-500/15 text-rose-400" },
  soft_redirect: { label: "Soft Redirect", color: "bg-amber-500/15 text-amber-400" },
  topic_scope: { label: "Topic Scope", color: "bg-sky-500/15 text-sky-400" },
  injection_defense: { label: "Injection Defense", color: "bg-violet-500/15 text-violet-400" },
};

const CATEGORIES: Category[] = ["hard_block", "injection_defense", "soft_redirect", "topic_scope"];

export default function GuardrailsPage() {
  const portfolioToken = useAuth((s) => s.token) ?? "";
  const [adminToken, setAdminToken] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return portfolioToken || localStorage.getItem("chat_admin_token") ?? "";
    }
    return "";
  });

  const [guardrails, setGuardrails] = useState<Guardrail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-form state
  const [showForm, setShowForm] = useState(false);
  const [newCategory, setNewCategory] = useState<Category>("hard_block");
  const [newRule, setNewRule] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const token = portfolioToken || adminToken;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${CHAT_API}/guardrails?token=${encodeURIComponent(token)}`);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      setGuardrails(await r.json());
    } catch (e) {
      setError(String(e));
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(id: number) {
    try {
      const r = await fetch(
        `${CHAT_API}/guardrails/${id}/toggle?token=${encodeURIComponent(token)}`,
        { method: "POST" }
      );
      if (!r.ok) throw new Error(`${r.status}`);
      const updated: Guardrail = await r.json();
      setGuardrails((prev) => prev.map((g) => (g.id === id ? updated : g)));
    } catch {
      setError("Failed to toggle guardrail.");
    }
  }

  async function remove(id: number) {
    if (!confirm("Delete this guardrail?")) return;
    try {
      const r = await fetch(
        `${CHAT_API}/guardrails/${id}?token=${encodeURIComponent(token)}`,
        { method: "DELETE" }
      );
      if (!r.ok) throw new Error(`${r.status}`);
      setGuardrails((prev) => prev.filter((g) => g.id !== id));
    } catch {
      setError("Failed to delete guardrail.");
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const rule = newRule.trim();
    if (!rule) { setFormError("Rule cannot be empty."); return; }
    setSaving(true);
    setFormError(null);
    try {
      const r = await fetch(
        `${CHAT_API}/guardrails?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category: newCategory, rule, is_active: true }),
        }
      );
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail ?? `${r.status}`);
      }
      const created: Guardrail = await r.json();
      setGuardrails((prev) => [...prev, created]);
      setNewRule("");
      setShowForm(false);
    } catch (e) {
      setFormError(String(e));
    }
    setSaving(false);
  }

  // Group guardrails by category preserving insertion order within each group
  const grouped = CATEGORIES.reduce<Record<Category, Guardrail[]>>(
    (acc, cat) => {
      acc[cat] = guardrails.filter((g) => g.category === cat);
      return acc;
    },
    { hard_block: [], soft_redirect: [], topic_scope: [], injection_defense: [] }
  );

  if (!token) {
    return (
      <div className="max-w-sm mx-auto mt-24 space-y-3">
        <h1 className="font-heading font-bold text-2xl">Guardrails</h1>
        <p className="text-muted text-sm">Not authenticated. Please log in as admin.</p>
        <a href="/admin/chat" className="text-xs text-primary hover:underline">← Back to Chat</a>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a
            href="/admin/chat"
            className="text-xs text-muted hover:text-fg transition-colors"
          >
            ← Back to Chat
          </a>
          <h1 className="font-heading font-bold text-2xl">Guardrails</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            className="text-xs text-muted hover:text-fg transition-colors"
          >
            ↻ Refresh
          </button>
          <button
            onClick={() => { setShowForm((v) => !v); setFormError(null); }}
            className="px-3 py-1.5 text-xs rounded-lg bg-primary text-white hover:opacity-90 transition-opacity font-medium"
          >
            {showForm ? "Cancel" : "+ Add guardrail"}
          </button>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-muted leading-relaxed">
        Guardrails are rules injected into the bot&apos;s system prompt at runtime. Active rules
        take effect immediately — no restart needed. Changes apply within 60 seconds (cache TTL).
      </p>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          {error}
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <form
          onSubmit={create}
          className="rounded-xl bg-surface border border-primary/30 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-fg">New guardrail</p>
          <div className="flex gap-3">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value as Category)}
              className="bg-bg border border-white/20 rounded-lg px-3 py-2 text-sm text-fg outline-none focus:border-primary transition-colors"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_META[c].label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            value={newRule}
            onChange={(e) => setNewRule(e.target.value)}
            placeholder="Describe the rule the bot must follow…"
            rows={3}
            className="w-full bg-bg border border-white/20 rounded-lg px-3 py-2 text-sm text-fg placeholder:text-muted outline-none focus:border-primary transition-colors resize-none"
          />
          {formError && <p className="text-xs text-rose-400">{formError}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {saving ? "Saving…" : "Save guardrail"}
            </button>
          </div>
        </form>
      )}

      {/* Loading */}
      {loading && (
        <p className="text-sm text-muted text-center py-8">Loading guardrails…</p>
      )}

      {/* Guardrail groups */}
      {!loading && (
        <div className="space-y-6">
          {CATEGORIES.map((cat) => {
            const items = grouped[cat];
            const meta = CATEGORY_META[cat];
            return (
              <div key={cat} className="rounded-xl bg-surface border border-white/10 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.color}`}>
                    {meta.label}
                  </span>
                  <span className="text-xs text-muted">{items.length} rule{items.length !== 1 ? "s" : ""}</span>
                </div>

                {items.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-muted italic">No rules in this category.</p>
                ) : (
                  <ul className="divide-y divide-white/5">
                    {items.map((g) => (
                      <li key={g.id} className="px-4 py-3 flex items-start gap-3">
                        {/* Active indicator */}
                        <button
                          onClick={() => toggle(g.id)}
                          title={g.is_active ? "Click to disable" : "Click to enable"}
                          className={[
                            "mt-0.5 flex-none w-4 h-4 rounded-full border transition-colors",
                            g.is_active
                              ? "bg-emerald-500 border-emerald-400"
                              : "bg-transparent border-white/30 hover:border-white/60",
                          ].join(" ")}
                        />
                        {/* Rule text */}
                        <p
                          className={[
                            "flex-1 text-sm leading-relaxed",
                            g.is_active ? "text-fg" : "text-muted line-through opacity-50",
                          ].join(" ")}
                        >
                          {g.rule}
                        </p>
                        {/* Delete */}
                        <button
                          onClick={() => remove(g.id)}
                          className="flex-none text-muted hover:text-rose-400 transition-colors text-xs px-1.5 py-0.5 rounded"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading && guardrails.length === 0 && !error && (
        <p className="text-center text-muted text-sm py-8">
          No guardrails yet. Add one above to protect the bot from information disclosure.
        </p>
      )}
    </div>
  );
}
