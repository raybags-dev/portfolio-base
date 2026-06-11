"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getBootstrap } from "@/lib/api";
import ThemeProvider from "@/components/ThemeProvider";
import Navbar from "@/components/Navbar";
import { Footer } from "@/components/sections";
import { useCookieConsent } from "@/lib/store";

export default function CookiePolicyPage() {
  const { data } = useQuery({ queryKey: ["bootstrap"], queryFn: getBootstrap });
  const { acceptAll, declineAll, decide, decided, analytics, functional } = useCookieConsent();

  return (
    <>
      {data && <ThemeProvider theme={data.theme} />}
      <div className="min-h-screen bg-bg text-text">
        {data && <Navbar site={data.site_configuration} theme={data.theme} sections={data.sections} />}
        <main className="container-x py-16 max-w-3xl">
          <div className="mb-10">
            <Link href="/" className="text-sm text-muted hover:text-primary transition-colors">
              ← Back to portfolio
            </Link>
          </div>

          <h1 className="font-heading font-extrabold text-4xl mb-2">Cookie & Privacy Policy</h1>
          <p className="text-muted text-sm mb-10">Last updated: June 2026</p>

          <Section title="1. Who we are">
            <p>
              This portfolio website is operated by a solo software and data engineer. For data
              protection enquiries, contact via the{" "}
              <Link href="/contact" className="text-primary hover:underline">
                contact page
              </Link>
              .
            </p>
          </Section>

          <Section title="2. What are cookies?">
            <p>
              Cookies are small text files stored in your browser. This site primarily uses{" "}
              <strong>browser localStorage</strong> (not HTTP cookies) to remember your preferences.
              The effect and legal basis are the same — they are considered equivalent under GDPR/ePrivacy.
            </p>
          </Section>

          <Section title="3. Cookies and storage we use">
            <div className="overflow-x-auto mt-3">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-white/15 text-left text-muted">
                    <th className="py-2 pr-4 font-semibold">Name</th>
                    <th className="py-2 pr-4 font-semibold">Type</th>
                    <th className="py-2 pr-4 font-semibold">Purpose</th>
                    <th className="py-2 font-semibold">Expires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8">
                  <tr>
                    <td className="py-2.5 pr-4 font-mono text-xs">raybags-cookie-consent</td>
                    <td className="py-2.5 pr-4"><Badge label="Necessary" color="blue" /></td>
                    <td className="py-2.5 pr-4 text-muted">Stores your cookie preference choices</td>
                    <td className="py-2.5 text-muted">1 year</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono text-xs">raybags-auth</td>
                    <td className="py-2.5 pr-4"><Badge label="Necessary" color="blue" /></td>
                    <td className="py-2.5 pr-4 text-muted">Admin session authentication (only active when logged in as admin)</td>
                    <td className="py-2.5 text-muted">Session</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono text-xs">raybags-ui</td>
                    <td className="py-2.5 pr-4"><Badge label="Functional" color="green" /></td>
                    <td className="py-2.5 pr-4 text-muted">Remembers your dark/light mode preference</td>
                    <td className="py-2.5 text-muted">Persistent</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono text-xs">IP address</td>
                    <td className="py-2.5 pr-4"><Badge label="Necessary" color="blue" /></td>
                    <td className="py-2.5 pr-4 text-muted">
                      Rate-limiting for interactive project demos. Stored server-side only. Not shared.
                    </td>
                    <td className="py-2.5 text-muted">Up to 30 days</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 pr-4 font-mono text-xs">Contact info (optional)</td>
                    <td className="py-2.5 pr-4"><Badge label="Functional" color="green" /></td>
                    <td className="py-2.5 pr-4 text-muted">
                      If you choose to share your name/email/role when running a project demo,
                      it is stored with your session for follow-up work enquiries only.
                      Requires explicit consent.
                    </td>
                    <td className="py-2.5 text-muted">Until deleted on request</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="4. Legal basis (GDPR)">
            <ul className="list-disc pl-5 space-y-1 text-muted text-sm">
              <li>
                <strong className="text-text">Strictly necessary</strong> — no consent required.
                Used purely to make the site function (session auth, rate-limiting).
              </li>
              <li>
                <strong className="text-text">Functional</strong> — legitimate interest / your
                consent. Remembering UI preferences to improve your experience.
              </li>
              <li>
                <strong className="text-text">Contact information</strong> — your explicit consent,
                given via the pre-run opt-in form. Lawful basis: Article 6(1)(a) GDPR.
              </li>
            </ul>
          </Section>

          <Section title="5. Data retention">
            <p>
              IP rate-limiting logs are retained for up to 30 days and then purged. Contact
              information you voluntarily provide is retained until you request deletion.
              Preference cookies persist until cleared by you or until they expire naturally.
            </p>
          </Section>

          <Section title="6. Third-party services">
            <p>
              This portfolio does not use Google Analytics, advertising networks, or social tracking
              pixels. All data stays on the self-hosted backend. No personal data is sold or shared
              with third parties.
            </p>
          </Section>

          <Section title="7. Your rights (GDPR)">
            <p className="mb-2">Under the General Data Protection Regulation you have the right to:</p>
            <ul className="list-disc pl-5 space-y-1 text-muted text-sm">
              <li>Access the personal data held about you</li>
              <li>Rectify inaccurate data</li>
              <li>Erasure ("right to be forgotten")</li>
              <li>Restrict processing</li>
              <li>Data portability</li>
              <li>Object to processing</li>
            </ul>
            <p className="mt-3">
              To exercise any right, use the{" "}
              <Link href="/contact" className="text-primary hover:underline">
                contact form
              </Link>{" "}
              with subject "Data Request". Requests are handled within 30 days.
            </p>
          </Section>

          <Section title="8. Managing your preferences">
            <p className="mb-4">
              You can update your cookie preferences at any time using the controls below, or by
              clearing your browser&apos;s localStorage.
            </p>

            {/* Live preference panel */}
            <div className="rounded-2xl border border-white/15 bg-surface overflow-hidden">
              <div className="px-5 py-4 border-b border-white/10">
                <h3 className="font-semibold text-sm">Your current preferences</h3>
                <p className="text-xs text-muted mt-0.5">
                  {decided ? "You have made a choice." : "You have not yet made a choice — defaults applied."}
                </p>
              </div>
              <div className="divide-y divide-white/8">
                <PrefRow label="Strictly Necessary" active={true} locked />
                <PrefRow label="Functional" active={functional} />
                <PrefRow label="Analytics" active={analytics} />
              </div>
              <div className="px-5 py-4 flex flex-wrap gap-2">
                <button
                  onClick={declineAll}
                  className="px-4 py-1.5 text-xs rounded-full border border-white/20 hover:border-white/40 transition-colors"
                >
                  Necessary only
                </button>
                <button
                  onClick={() => decide(true, true)}
                  className="px-4 py-1.5 text-xs rounded-full border border-white/20 hover:border-white/40 transition-colors"
                >
                  Accept functional + analytics
                </button>
                <button
                  onClick={acceptAll}
                  className="px-4 py-1.5 text-xs rounded-full bg-primary text-white hover:opacity-90 transition-opacity"
                >
                  Accept all
                </button>
              </div>
            </div>
          </Section>

          <Section title="9. Changes to this policy">
            <p>
              This policy may be updated to reflect changes to the site. Significant changes will
              reset your consent preference so you can review the new terms.
            </p>
          </Section>
        </main>
        {data && <Footer data={data} />}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="font-heading font-bold text-xl mb-3">{title}</h2>
      <div className="text-sm text-muted leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function Badge({ label, color }: { label: string; color: "blue" | "green" | "yellow" }) {
  const cls =
    color === "blue"
      ? "bg-blue-500/15 text-blue-400"
      : color === "green"
        ? "bg-green-500/15 text-green-400"
        : "bg-yellow-500/15 text-yellow-400";
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

function PrefRow({ label, active, locked }: { label: string; active: boolean; locked?: boolean }) {
  return (
    <div className="flex items-center justify-between px-5 py-3 text-sm">
      <span className={locked ? "text-muted" : ""}>{label}</span>
      <span
        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
          active
            ? "bg-green-500/15 text-green-400"
            : "bg-white/8 text-muted"
        }`}
      >
        {active ? "On" : "Off"}{locked ? " (required)" : ""}
      </span>
    </div>
  );
}
