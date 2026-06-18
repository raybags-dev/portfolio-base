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
          <div className="grid sm:grid-cols-3 gap-4 mb-5">
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

        {/* WhatsApp CTA — only shown when a phone number is configured */}
        {site.phone && (
          <div className="mb-10">
            <a
              href={`https://wa.me/${site.phone.replace(/[\s\-()]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 rounded-theme border border-[#25D366]/40 bg-[#25D366]/10 px-5 py-3 text-sm font-medium text-[#25D366] hover:bg-[#25D366]/20 hover:border-[#25D366]/70 transition-colors"
            >
              {/* WhatsApp icon */}
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
              </svg>
              Chat on WhatsApp
            </a>
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
