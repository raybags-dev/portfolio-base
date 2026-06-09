"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBootstrap, getContactChallenge, submitContact } from "@/lib/api";
import ThemeProvider from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";
import { useUI } from "@/lib/store";
import { Footer } from "@/components/sections";

export default function ContactPage() {
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const uiMode = useUI((s) => s.mode);
  const isDark = (uiMode ?? data?.theme?.default_mode ?? "dark") === "dark";

  const [form, setForm] = useState({ name: "", email: "", subject: "", message: "", website: "" });
  const [challenge, setChallenge] = useState<{ token: string; question: string } | null>(null);
  const [answer, setAnswer] = useState("");
  const [robot, setRobot] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadChallenge = () =>
    getContactChallenge().then(setChallenge).catch(() => setChallenge(null));

  useEffect(() => {
    loadChallenge();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    if (!robot) {
      setStatus({ ok: false, msg: "Please confirm you're not a robot." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const res = await submitContact({
        name: form.name,
        email: form.email,
        subject: form.subject || undefined,
        message: form.message,
        challenge_token: challenge.token,
        challenge_answer: Number(answer),
        website: form.website || undefined,
      });
      setStatus({ ok: true, msg: res.detail || "Message sent." });
      setForm({ name: "", email: "", subject: "", message: "", website: "" });
      setAnswer("");
      setRobot(false);
      loadChallenge();
    } catch (err) {
      setStatus({ ok: false, msg: err instanceof Error ? err.message : "Failed to send." });
      loadChallenge();
      setRobot(false);
    } finally {
      setBusy(false);
    }
  }

  if (!data) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-muted animate-pulse">Loading…</p>
      </main>
    );
  }

  const site = data.site_configuration;
  const input = "w-full rounded-theme bg-bg border border-white/15 px-3 py-2 outline-none focus:border-primary";

  return (
    <>
      <ThemeProvider theme={data.theme} />
      <Navbar site={site} theme={data.theme} sections={data.sections} />
      <main className="container-x py-14 min-h-[80vh]">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold mb-3">Contact</h1>
        <p className="text-muted mb-8 max-w-2xl">
          Have a project or opportunity? Send a message — I&apos;ll get back to you.
        </p>

        {/* Info cards */}
        {(site.contact_email || site.phone || site.location_address) && (
          <div className="grid sm:grid-cols-3 gap-4 mb-10">
            {site.contact_email && (
              <a
                href={`mailto:${site.contact_email}`}
                className="flex items-center gap-3 rounded-theme bg-surface border border-white/10 p-4 hover:border-primary/50 transition-colors"
              >
                <svg className="w-5 h-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 7 10-7"/></svg>
                <div className="min-w-0">
                  <div className="text-xs text-muted uppercase tracking-wide mb-0.5">Email</div>
                  <div className="text-sm truncate">{site.contact_email}</div>
                </div>
              </a>
            )}
            {site.phone && (
              <a
                href={`tel:${site.phone}`}
                className="flex items-center gap-3 rounded-theme bg-surface border border-white/10 p-4 hover:border-primary/50 transition-colors"
              >
                <svg className="w-5 h-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 13.5a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 2.73h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 10.34a16 16 0 0 0 5.76 5.76l1.7-1.71a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                <div>
                  <div className="text-xs text-muted uppercase tracking-wide mb-0.5">Mobile</div>
                  <div className="text-sm">{site.phone}</div>
                </div>
              </a>
            )}
            {site.location_address && (
              <div className="flex items-center gap-3 rounded-theme bg-surface border border-white/10 p-4">
                <svg className="w-5 h-5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <div>
                  <div className="text-xs text-muted uppercase tracking-wide mb-0.5">Location</div>
                  <div className="text-sm">{site.location_address}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Map + Form — perfectly aligned same-height grid */}
        <div className="grid md:grid-cols-2 gap-8 md:items-stretch">
          {/* Map */}
          <div className="flex flex-col min-h-[480px]">
            {site.map_embed_url ? (
              <iframe
                title="Location map"
                src={site.map_embed_url}
                width="100%"
                style={{
                  border: 0,
                  filter: isDark
                    ? "invert(90%) hue-rotate(180deg) brightness(0.85) contrast(0.9)"
                    : "none",
                }}
                className="w-full flex-1 rounded-theme border border-white/10"
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="w-full flex-1 rounded-theme border border-white/10 grid place-items-center text-muted text-sm">
                Map not configured
              </div>
            )}
          </div>

          {/* Form */}
          <form onSubmit={onSubmit} className="space-y-4 rounded-theme bg-surface border border-white/10 p-6">
            {status && (
              <p className={`text-sm rounded p-2 ${status.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                {status.msg}
              </p>
            )}
            <input required placeholder="Your name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
            <input required type="email" placeholder="Your email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={input} />
            <input placeholder="Subject (optional)" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={input} />
            <textarea required placeholder="Your message" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className={input} />
            {/* honeypot */}
            <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" aria-hidden="true" />
            <div className="flex items-center gap-3">
              <input required type="number" placeholder={challenge ? challenge.question : "…"} value={answer} onChange={(e) => setAnswer(e.target.value)} className="w-40 rounded-theme bg-bg border border-white/15 px-3 py-2" />
              <span className="text-sm text-muted">{challenge?.question}</span>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={robot} onChange={(e) => setRobot(e.target.checked)} />
              I&apos;m not a robot
            </label>
            <button type="submit" disabled={busy} className="w-full rounded-theme bg-primary text-white py-2.5 font-medium hover:opacity-90 disabled:opacity-50">
              {busy ? "Sending…" : "Send message"}
            </button>
          </form>
        </div>
      </main>
      <Footer data={data} />
    </>
  );
}
