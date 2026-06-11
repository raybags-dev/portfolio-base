"use client";
import { useState } from "react";

export interface RunContactInfo {
  name: string;
  role: string;
  email: string;
  phone: string;
}

interface Props {
  projectName: string;
  onRun: (contact?: RunContactInfo) => void;
  onClose: () => void;
}

export default function RunProjectDisclaimer({ projectName, onRun, onClose }: Props) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [gdprConsent, setGdprConsent] = useState(false);

  const hasContactInfo = !!(name.trim() || role.trim() || email.trim() || phone.trim());
  const canProceed = !hasContactInfo || gdprConsent;

  function handleRunAnyway() {
    onRun();
  }

  function handleSubmitAndRun(e: React.FormEvent) {
    e.preventDefault();
    if (!canProceed) return;
    onRun(
      hasContactInfo
        ? { name: name.trim(), role: role.trim(), email: email.trim(), phone: phone.trim() }
        : undefined,
    );
  }

  const inputCls =
    "w-full bg-white/5 border border-white/15 rounded-lg px-3 py-2 text-sm placeholder:text-muted/60 focus:outline-none focus:border-primary/60 transition-colors";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-surface border border-white/15 rounded-2xl shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-start gap-3 p-5 border-b border-white/10">
          <span className="text-xl mt-0.5 shrink-0">⚡</span>
          <div className="flex-1 min-w-0">
            <h2 className="font-heading font-bold text-base">Running: {projectName}</h2>
            <p className="text-xs text-muted mt-1 leading-relaxed">
              This demo runs on{" "}
              <span className="text-text">real infrastructure</span> — AI models, live web crawlers,
              and cloud compute. Every run has a real cost in time and money.
              I genuinely appreciate you checking out my work!
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 text-muted hover:text-text transition-colors mt-0.5"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmitAndRun}>
          <div className="p-5 space-y-4">
            {/* optional contact */}
            <div>
              <p className="text-xs font-medium mb-2 text-muted uppercase tracking-wide">
                Who are you? <span className="normal-case font-normal">(optional — helps me know who's exploring)</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputCls}
                />
                <input
                  placeholder="Role / Title"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={inputCls}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                />
                <input
                  placeholder="Phone / Telegram (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputCls}
                />
              </div>
            </div>

            {/* hire me nudge */}
            <div className="rounded-xl bg-primary/10 border border-primary/20 px-4 py-3 text-xs text-muted leading-relaxed">
              Interested in hiring me or collaborating?{" "}
              <a href="/contact" target="_blank" className="text-primary hover:underline">
                Get in touch
              </a>{" "}
              — or just leave your details above and I'll reach out.
            </div>

            {/* GDPR consent — only shown when contact fields are filled */}
            {hasContactInfo && (
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={gdprConsent}
                  onChange={(e) => setGdprConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-primary"
                />
                <span className="text-xs text-muted leading-relaxed group-hover:text-text transition-colors">
                  I consent to my contact details being stored by the site owner for the purpose of
                  work enquiries and opportunities. Data is processed as described in the{" "}
                  <a href="/cookie-policy" target="_blank" className="text-primary hover:underline">
                    privacy & cookie policy
                  </a>
                  . I can request deletion at any time.
                </span>
              </label>
            )}

            {/* GDPR notice always visible */}
            <p className="text-[10px] text-muted/60 leading-relaxed">
              By running this project you acknowledge that your IP address may be logged for rate-limiting
              purposes only. No personal data is stored without your explicit consent above.
            </p>
          </div>

          {/* footer actions */}
          <div className="flex gap-3 px-5 pb-5">
            <button
              type="button"
              onClick={handleRunAnyway}
              className="flex-1 py-2.5 text-sm rounded-xl border border-white/20 hover:border-white/40 transition-colors"
            >
              Run Anyway
            </button>
            <button
              type="submit"
              disabled={!canProceed}
              className="flex-1 py-2.5 text-sm rounded-xl bg-primary text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all font-medium"
            >
              {hasContactInfo ? "Submit & Run" : "Proceed"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
