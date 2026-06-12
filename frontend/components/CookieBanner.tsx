"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { Toggle } from "@/components/ui/Toggle";
import { useCookieConsent } from "@/lib/store";

export default function CookieBanner() {
  const { decided, acceptAll, declineAll, decide } = useCookieConsent();
  const [mounted, setMounted] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const [analytics, setAnalytics] = useState(true);
  const [functional, setFunctional] = useState(true);

  useEffect(() => setMounted(true), []);

  if (!mounted || decided) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 md:p-5">
      <div className="max-w-3xl mx-auto bg-surface border border-white/20 rounded-2xl shadow-2xl overflow-hidden">
        {!customizing ? (
          <div className="p-5 md:p-6">
            <div className="flex items-start gap-3 mb-4">
              <span className="text-xl mt-0.5 shrink-0">🍪</span>
              <div>
                <h3 className="font-heading font-bold text-sm mb-1">Cookies & Privacy</h3>
                <p className="text-xs text-muted leading-relaxed">
                  This site uses cookies and browser storage for essential functionality and to remember
                  your preferences. Read our{" "}
                  <Link href="/cookie-policy" className="text-primary hover:underline">
                    Cookie Policy
                  </Link>{" "}
                  for full details. You can customise what you allow below.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <button
                onClick={() => setCustomizing(true)}
                className="px-4 py-1.5 text-xs rounded-full border border-white/20 hover:border-white/40 transition-colors"
              >
                Customise
              </button>
              <button
                onClick={declineAll}
                className="px-4 py-1.5 text-xs rounded-full border border-white/20 hover:border-white/40 transition-colors"
              >
                Necessary only
              </button>
              <button
                onClick={acceptAll}
                className="px-4 py-1.5 text-xs rounded-full bg-primary text-white hover:opacity-90 transition-opacity font-medium"
              >
                Accept all
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 md:p-6">
            <h3 className="font-heading font-bold text-sm mb-4">Customise Cookie Preferences</h3>
            <div className="space-y-2 mb-5">
              <ToggleRow
                title="Strictly Necessary"
                description="Required for the site to function correctly. Cannot be disabled."
                checked
                disabled
              />
              <ToggleRow
                title="Functional"
                description="Remembers your preferences such as dark/light mode across visits."
                checked={functional}
                onChange={setFunctional}
              />
              <ToggleRow
                title="Analytics"
                description="Helps understand how visitors use the site (anonymised, no personal data)."
                checked={analytics}
                onChange={setAnalytics}
              />
            </div>
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <button
                onClick={() => setCustomizing(false)}
                className="text-xs text-muted hover:text-text transition-colors"
              >
                ← Back
              </button>
              <div className="flex gap-2">
                <button
                  onClick={declineAll}
                  className="px-4 py-1.5 text-xs rounded-full border border-white/20 hover:border-white/40 transition-colors"
                >
                  Decline all
                </button>
                <button
                  onClick={() => decide(analytics, functional)}
                  className="px-4 py-1.5 text-xs rounded-full bg-primary text-white hover:opacity-90 transition-opacity font-medium"
                >
                  Save preferences
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3 rounded-xl bg-white/5 border border-white/8">
      <div className="min-w-0">
        <div className="text-xs font-medium">{title}</div>
        <div className="text-xs text-muted mt-0.5 leading-relaxed">{description}</div>
      </div>
      <Toggle
        checked={checked}
        onChange={(v) => onChange?.(v)}
        disabled={disabled}
      />
    </div>
  );
}
