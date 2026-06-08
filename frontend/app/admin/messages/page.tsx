"use client";
import { useQuery } from "@tanstack/react-query";
import { listContactMessages } from "@/lib/api";
import { useAuth } from "@/lib/store";

export default function MessagesAdmin() {
  const token = useAuth((s) => s.token)!;
  const { data: messages = [] } = useQuery({
    queryKey: ["contact-messages"],
    queryFn: () => listContactMessages(token),
  });

  return (
    <div className="max-w-3xl">
      <h1 className="font-heading font-bold text-2xl mb-6">Contact Messages</h1>
      <div className="space-y-3">
        {messages.map((m: any) => (
          <div key={m.id} className="rounded-theme bg-surface border border-white/10 p-4">
            <div className="flex items-center justify-between">
              <div className="font-medium">
                {m.name} <span className="text-muted text-sm">&lt;{m.email}&gt;</span>
              </div>
              <span className="text-xs text-muted">
                {m.delivered ? "emailed" : "stored"} · {new Date(m.created_at).toLocaleString()}
              </span>
            </div>
            {m.subject && <div className="text-sm text-secondary mt-1">{m.subject}</div>}
            <p className="text-sm text-muted mt-2 whitespace-pre-line">{m.message}</p>
          </div>
        ))}
        {messages.length === 0 && <p className="text-muted text-sm">No messages yet.</p>}
      </div>
    </div>
  );
}
