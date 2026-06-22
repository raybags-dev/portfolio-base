"use client";
import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listContactMessages, issueToken, rejectRequest } from "@/lib/api";
import { useAuth } from "@/lib/store";

const PIPELINE_SUBJECT = "DataForge Pipeline Run Request";

type MsgAction = {
  state: "idle" | "busy" | "done" | "error";
  result?: string;
};

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

  async function handleIssue(id: number) {
    setAction(id, { state: "busy" });
    try {
      const res = await issueToken(token, id);
      setAction(id, {
        state: "done",
        result: `Token issued${res.delivered ? " & emailed" : " (email failed — copy below)"}:\n${res.token}`,
      });
      qc.invalidateQueries({ queryKey: ["contact-messages"] });
    } catch (err) {
      setAction(id, { state: "error", result: err instanceof Error ? err.message : "Failed" });
    }
  }

  async function handleReject(id: number) {
    setAction(id, { state: "busy" });
    try {
      const res = await rejectRequest(token, id);
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
          const act = actions[m.id] ?? { state: "idle" };
          const acted = act.state === "done" || act.state === "error";

          return (
            <div
              key={m.id}
              className={`rounded-theme bg-surface border p-4 ${
                isPipelineReq ? "border-primary/30" : "border-white/10"
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
                </div>
                <span className="text-xs text-muted shrink-0">
                  {m.delivered ? "notified" : "stored"} ·{" "}
                  {new Date(m.created_at).toLocaleString()}
                </span>
              </div>

              {m.subject && !isPipelineReq && (
                <div className="text-sm text-secondary mt-1">{m.subject}</div>
              )}
              <p className="text-sm text-muted mt-2 whitespace-pre-line">{m.message}</p>

              {/* Pipeline request actions */}
              {isPipelineReq && !acted && (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => handleIssue(m.id)}
                    disabled={act.state === "busy"}
                    className="px-3 py-1.5 text-xs rounded-theme bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-50 transition-colors font-medium"
                  >
                    {act.state === "busy" ? "Issuing…" : "Issue Token & Email"}
                  </button>
                  <button
                    onClick={() => handleReject(m.id)}
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
