"use client";
import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listContactMessages,
  issueToken,
  rejectRequest,
  issueTryoutToken,
  rejectTryoutRequest,
} from "@/lib/api";
import { useAuth } from "@/lib/store";

const PIPELINE_SUBJECT = "DataForge Pipeline Run Request";
const TRYOUT_PREFIX = "Tryout: ";

type MsgAction = {
  state: "idle" | "busy" | "done" | "error";
  result?: string;
};

function tryoutApp(subject: string | null | undefined): string | null {
  if (!subject || !subject.startsWith(TRYOUT_PREFIX)) return null;
  return subject.slice(TRYOUT_PREFIX.length).trim() || null;
}

export default function MessagesAdmin() {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const { data: messages = [] } = useQuery({
    queryKey: ["contact-messages"],
    queryFn: () => listContactMessages(token),
  });

  const [actions, setActions] = useState<Record<number, MsgAction>>({});

  const setAction = useCallback((id: number, update: Partial<MsgAction>) => {
    setActions((prev) => {
      const current: MsgAction = prev[id] ?? { state: "idle" };
      return { ...prev, [id]: { ...current, ...update } };
    });
  }, []);

  async function handleIssue(id: number, isTryout: boolean) {
    setAction(id, { state: "busy" });
    try {
      if (isTryout) {
        const res = await issueTryoutToken(token, id);
        setAction(id, {
          state: "done",
          result:
            `24h tryout token issued${res.delivered ? " & emailed" : " (email failed - copy below)"}:\n` +
            `${res.token}\napp: ${res.app_name} · quota: ${res.max_uses} runs · expires: ${new Date(res.expires_at).toLocaleString()}`,
        });
      } else {
        const res = await issueToken(token, id);
        setAction(id, {
          state: "done",
          result: `Token issued${res.delivered ? " & emailed" : " (email failed - copy below)"}:\n${res.token}`,
        });
      }
      qc.invalidateQueries({ queryKey: ["contact-messages"] });
    } catch (err) {
      setAction(id, { state: "error", result: err instanceof Error ? err.message : "Failed" });
    }
  }

  async function handleReject(id: number, isTryout: boolean) {
    setAction(id, { state: "busy" });
    try {
      const res = isTryout
        ? await rejectTryoutRequest(token, id)
        : await rejectRequest(token, id);
      setAction(id, {
        state: "done",
        result: res.delivered ? "Rejection email sent." : "Marked as read (email not sent).",
      });
      qc.invalidateQueries({ queryKey: ["contact-messages"] });
    } catch (err) {
      setAction(id, { state: "error", result: err instanceof Error ? err.message : "Failed" });
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading font-bold text-2xl mb-6">Contact Messages</h1>
      <div className="space-y-3">
        {(messages as any[]).map((m) => {
          const isPipelineReq = m.subject === PIPELINE_SUBJECT;
          const tryout = tryoutApp(m.subject);
          const isActionable = isPipelineReq || tryout !== null;
          const act = actions[m.id] ?? { state: "idle" };
          const acted = act.state === "done" || act.state === "error";

          return (
            <div
              key={m.id}
              className={`rounded-theme bg-surface border p-4 ${
                isActionable ? "border-primary/30" : "border-white/10"
              }`}
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <span className="font-medium">{m.name}</span>{" "}
                  <span className="text-muted text-sm">&lt;{m.email}&gt;</span>
                  {isPipelineReq && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                      Pipeline request
                    </span>
                  )}
                  {tryout && (
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400">
                      Tryout: {tryout}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted shrink-0">
                  {m.delivered ? "notified" : "stored"} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>

              {m.subject && !isActionable && (
                <div className="text-sm text-secondary mt-1">{m.subject}</div>
              )}
              <p className="text-sm text-muted mt-2 whitespace-pre-line">{m.message}</p>

              {/* Access-request actions */}
              {isActionable && !acted && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleIssue(m.id, tryout !== null)}
                    disabled={act.state === "busy"}
                    className="px-3 py-1.5 text-xs rounded-theme bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-50 transition-colors font-medium"
                  >
                    {act.state === "busy"
                      ? "Issuing…"
                      : tryout
                        ? "Issue 24h Token & Email"
                        : "Issue Token & Email"}
                  </button>
                  <button
                    onClick={() => handleReject(m.id, tryout !== null)}
                    disabled={act.state === "busy"}
                    className="px-3 py-1.5 text-xs rounded-theme bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-colors font-medium"
                  >
                    {act.state === "busy" ? "Rejecting…" : "Reject"}
                  </button>
                </div>
              )}

              {/* Action result */}
              {act.result && (
                <div
                  className={`mt-3 p-2 rounded text-xs whitespace-pre-wrap font-mono border ${
                    act.state === "error"
                      ? "bg-red-500/10 border-red-500/20 text-red-400"
                      : "bg-green-500/10 border-green-500/20 text-green-400"
                  }`}
                >
                  {act.result}
                </div>
              )}
            </div>
          );
        })}
        {messages.length === 0 && <p className="text-muted text-sm">No messages yet.</p>}
      </div>
    </div>
  );
}
