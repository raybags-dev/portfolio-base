"use client";

import { useCallback, useEffect, useState } from "react";

const CHAT_API = "/chat/api/v1";

interface AIConfig {
  provider: string;
  model: string | null;
  default_model: string;
  has_api_key: boolean;
  api_key_preview: string | null;
  providers: string[];
  default_models: Record<string, string>;
}

const PROVIDER_LABELS: Record<string, string> = {
  deepseek: "DeepSeek (default)",
  groq: "Groq",
  claude: "Claude (Anthropic)",
  gemini: "Gemini (Google)",
};

const KEY_HINTS: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  groq: "GROQ_API_KEY",
  claude: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

export default function ChatAIProvider({ adminToken }: { adminToken: string }) {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [provider, setProvider] = useState("deepseek");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${CHAT_API}/ai-config?token=${encodeURIComponent(adminToken)}`);
      if (!r.ok) throw new Error(String(r.status));
      const data: AIConfig = await r.json();
      setConfig(data);
      setProvider(data.provider);
      setModel(data.model ?? "");
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [adminToken]);

  useEffect(() => {
    if (adminToken) load();
  }, [adminToken, load]);

  async function handleSave() {
    setSaving(true);
    setResult(null);
    try {
      const r = await fetch(`${CHAT_API}/ai-config?token=${encodeURIComponent(adminToken)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: model.trim() || null,
          api_key: apiKey.trim() || null,
        }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data: AIConfig = await r.json();
      setConfig(data);
      setApiKey("");
      setResult({ ok: true, text: `Saved — ${data.provider} is now live for new chat turns.` });
    } catch {
      setResult({ ok: false, text: "Save failed — check the token and try again." });
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setResult(null);
    try {
      const r = await fetch(`${CHAT_API}/ai-config/test?token=${encodeURIComponent(adminToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          model: model.trim() || null,
          api_key: apiKey.trim() || null,
        }),
      });
      const data = await r.json();
      if (data.ok) {
        setResult({ ok: true, text: `Connection OK (${data.model}): "${data.reply}"` });
      } else {
        setResult({ ok: false, text: data.detail || "Connection failed." });
      }
    } catch {
      setResult({ ok: false, text: "Test request failed." });
    } finally {
      setTesting(false);
    }
  }

  if (loadError) return null;
  if (!config) {
    return (
      <div className="rounded-theme bg-surface border border-white/10 p-4 text-xs text-muted">
        Loading AI provider…
      </div>
    );
  }

  return (
    <div className="rounded-theme bg-surface border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">AI Provider</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
          live: {config.provider}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="text-xs text-muted block mb-1">Provider</label>
          <select
            value={provider}
            onChange={(e) => { setProvider(e.target.value); setResult(null); }}
            className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary"
          >
            {config.providers.map((p) => (
              <option key={p} value={p}>{PROVIDER_LABELS[p] ?? p}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">
            Model <span className="text-muted/60">(blank = {config.default_models[provider]})</span>
          </label>
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder={config.default_models[provider]}
            className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary font-mono"
          />
        </div>
        <div>
          <label className="text-xs text-muted block mb-1">
            API key{" "}
            {config.has_api_key && provider === config.provider
              ? `(${config.api_key_preview})`
              : `(falls back to server ${KEY_HINTS[provider]})`}
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={config.has_api_key && provider === config.provider ? "(stored - type to replace)" : "paste key here"}
            className="w-full rounded-theme bg-bg border border-white/15 px-3 py-2 text-sm outline-none focus:border-primary font-mono"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-theme bg-primary text-white px-4 py-2 text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {saving ? "Saving…" : "Save & apply"}
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          className="rounded-theme border border-white/15 px-4 py-2 text-xs text-muted hover:border-white/30 disabled:opacity-50 transition-colors"
        >
          {testing ? "Testing…" : "Test connection"}
        </button>
        {result && (
          <span className={`text-xs ${result.ok ? "text-emerald-400" : "text-rose-400"}`}>
            {result.text}
          </span>
        )}
      </div>

      <p className="text-xs text-muted">
        Default is DeepSeek. Claude/Gemini are text-only here (no tool use); DeepSeek and Groq keep
        the token-issuing + escalation tools. If the selected provider has no key, the chat falls
        back to any provider with a server-side key so it never goes dark.
      </p>
    </div>
  );
}
