"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBootstrap, getContactChallenge, submitContact } from "@/lib/api";
import ThemeProvider from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";

export default function ContactPage() {
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });

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
  const email = site.contact_email || "baguma.github@gmail.com";
  const input = "w-full rounded-theme bg-bg border border-white/15 px-3 py-2 outline-none focus:border-primary";

  return (
    <>
      <ThemeProvider theme={data.theme} />
      <Navbar site={site} theme={data.theme} sections={data.sections} />
      <main className="container-x py-14">
        <h1 className="text-3xl sm:text-4xl font-heading font-bold mb-3">Contact</h1>
        <p className="text-muted mb-10 max-w-2xl">
          Have a project or opportunity? Send a message — I&apos;ll get back to you.
        </p>

        <div className="grid md:grid-cols-2 gap-10">
          {/* info + map */}
          <div className="space-y-5">
            <div className="space-y-2">
              <p>
                <span className="text-primary font-medium">Email:</span>{" "}
                <a href={`mailto:${email}`} className="hover:underline">{email}</a>
              </p>
              {site.phone && (
                <p>
                  <span className="text-primary font-medium">Mobile:</span>{" "}
                  <a href={`tel:${site.phone}`} className="hover:underline">{site.phone}</a>
                </p>
              )}
              {site.location_address && (
                <p>
                  <span className="text-primary font-medium">Location:</span>{" "}
                  {site.location_address}
                </p>
              )}
            </div>
            {site.map_embed_url ? (
              <iframe
                title="Location map"
                src={site.map_embed_url}
                className="w-full h-72 rounded-theme border border-white/10"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="w-full h-72 rounded-theme border border-white/10 grid place-items-center text-muted text-sm">
                Map not configured
              </div>
            )}
          </div>

          {/* form */}
          <form onSubmit={onSubmit} className="space-y-4 rounded-theme bg-surface border border-white/10 p-6">
            {status && (
              <p className={`text-sm rounded p-2 ${status.ok ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                {status.msg}
              </p>
            )}
            <input
              required
              placeholder="Your name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={input}
            />
            <input
              required
              type="email"
              placeholder="Your email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className={input}
            />
            <input
              placeholder="Subject (optional)"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className={input}
            />
            <textarea
              required
              placeholder="Your message"
              rows={5}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className={input}
            />
            {/* honeypot: hidden from humans */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className="hidden"
              aria-hidden="true"
            />

            <div className="flex items-center gap-3">
              <input
                required
                type="number"
                placeholder={challenge ? challenge.question : "…"}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="w-40 rounded-theme bg-bg border border-white/15 px-3 py-2"
              />
              <span className="text-sm text-muted">{challenge?.question}</span>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={robot}
                onChange={(e) => setRobot(e.target.checked)}
              />
              I&apos;m not a robot
            </label>

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-theme bg-primary text-white py-2.5 font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send message"}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
