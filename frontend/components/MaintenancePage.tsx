"use client";
import { useEffect, useState } from "react";
import type { Bootstrap } from "@/lib/types";
import ChatWidget from "@/components/ChatWidget";

// ── Animated pipeline background ────────────────────────────────────────────

function PipelineBackground({ isDark }: { isDark: boolean }) {
  const lineColor = isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.06)";
  const flowGradientId = isDark ? "pg-line-dark" : "pg-line-light";
  const nodeStroke = isDark ? "rgba(204,2,2,0.35)" : "rgba(204,2,2,0.3)";
  const nodeFill = isDark ? "rgba(204,2,2,0.12)" : "rgba(204,2,2,0.08)";
  const connectorColor = isDark ? "rgba(204,2,2,0.08)" : "rgba(204,2,2,0.1)";

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={flowGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#CC0202" stopOpacity="0" />
          <stop offset="50%" stopColor="#CC0202" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#CC0202" stopOpacity="0" />
        </linearGradient>
        <filter id="pg-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {[18, 35, 52, 68, 83].map((y, i) => (
        <g key={i}>
          <line x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke={lineColor} strokeWidth="1" />
          <line
            x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`}
            stroke={`url(#${flowGradientId})`}
            strokeWidth="1.5"
            strokeDasharray="120 9999"
            strokeDashoffset="0"
            filter="url(#pg-glow)"
            style={{
              animation: `pg-flow ${4 + i * 0.9}s linear infinite`,
              animationDelay: `${i * -1.2}s`,
            }}
          />
          {[15, 35, 55, 75, 92].map((x, j) => (
            <circle
              key={j}
              cx={`${x}%`} cy={`${y}%`}
              r="3"
              fill={nodeFill}
              stroke={nodeStroke}
              strokeWidth="1"
              style={{
                animation: `pg-pulse 2.5s ease-in-out infinite`,
                animationDelay: `${(i + j) * 0.3}s`,
              }}
            />
          ))}
        </g>
      ))}

      {[20, 45, 70, 90].map((x, i) => (
        <line
          key={i}
          x1={`${x}%`} y1="15%" x2={`${x}%`} y2="87%"
          stroke={connectorColor}
          strokeWidth="1"
          strokeDasharray="4 6"
        />
      ))}

      <style>{`
        @keyframes pg-flow {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: -9999; }
        }
        @keyframes pg-pulse {
          0%, 100% { r: 3; opacity: 0.4; }
          50%       { r: 5; opacity: 1;   }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </svg>
  );
}

// ── Countdown timer ──────────────────────────────────────────────────────────

function useCountdown(endAt: string | null | undefined) {
  const [diff, setDiff] = useState<number | null>(null);

  useEffect(() => {
    if (!endAt) return;
    const target = new Date(endAt).getTime();
    if (isNaN(target)) return;
    function tick() {
      const remaining = target - Date.now();
      setDiff(remaining > 0 ? remaining : 0);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endAt]);

  if (diff === null || diff <= 0) return null;

  const totalSecs = Math.floor(diff / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  return { days, hours, mins, secs };
}

function CountdownBox({ value, label, isDark }: { value: number; label: string; isDark: boolean }) {
  const v = String(value).padStart(2, "0");
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="relative w-16 h-16 rounded-xl flex items-center justify-center font-mono font-bold text-2xl overflow-hidden"
        style={{
          color: isDark ? "#fff" : "#111827",
          background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
          border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid rgba(0,0,0,0.1)",
          boxShadow: isDark
            ? "0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)"
            : "0 4px 16px rgba(0,0,0,0.08)",
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-px" style={{ background: isDark ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.08)" }} />
        {v}
      </div>
      <span className="text-xs uppercase tracking-widest" style={{ color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }}>{label}</span>
    </div>
  );
}

function Countdown({ endAt, isDark }: { endAt: string | null | undefined; isDark: boolean }) {
  const countdown = useCountdown(endAt);
  if (!countdown) return null;
  const sep = <span style={{ color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)" }} className="text-2xl font-bold mt-3.5">:</span>;
  return (
    <div className="mt-8">
      <p className="text-xs uppercase tracking-widest text-center mb-4" style={{ color: isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)" }}>
        Back online in
      </p>
      <div className="flex items-start gap-3 justify-center">
        <CountdownBox value={countdown.days} label="days" isDark={isDark} />
        {sep}
        <CountdownBox value={countdown.hours} label="hrs" isDark={isDark} />
        {sep}
        <CountdownBox value={countdown.mins} label="min" isDark={isDark} />
        {sep}
        <CountdownBox value={countdown.secs} label="sec" isDark={isDark} />
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function MaintenancePage({ data }: { data: Bootstrap }) {
  const site = data.site_configuration;

  // maintenance_theme set in admin overrides default_mode
  const rawTheme = site.maintenance_theme || data.theme.default_mode || "dark";
  const isDark = rawTheme === "dark";

  const title = site.maintenance_title || "Under Maintenance";
  const message = site.maintenance_message || "We're upgrading the data pipeline. Check back soon.";
  const email = site.contact_email;
  const phone = site.phone;

  // Dedicated maintenance logo — explicit field only, no fallback to site logo
  const logoUrl = site.maintenance_logo_url || null;

  const bgUrl = isDark
    ? (site.maintenance_bg_image_url_dark || site.maintenance_bg_image_url)
    : (site.maintenance_bg_image_url_light || site.maintenance_bg_image_url);

  const pageBg = isDark ? "#0a0a0f" : "#f0f4f8";
  const cardBg = isDark ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.85)";
  const cardBorder = isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)";
  const cardShadow = isDark
    ? "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(204,2,2,0.08)"
    : "0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(204,2,2,0.06)";
  const titleColor = isDark ? "#fff" : "#111827";
  const msgColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.55)";
  const dividerColor = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const labelColor = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)";
  const contactColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";

  const gradientOverlay = isDark
    ? "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(204,2,2,0.06) 0%, transparent 70%), linear-gradient(180deg, #0a0a0f 0%, #12121a 50%, #0a0a0f 100%)"
    : "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(204,2,2,0.04) 0%, transparent 70%), linear-gradient(180deg, #f0f4f8 0%, #e8edf3 50%, #f0f4f8 100%)";

  return (
    <div
      className="relative min-h-screen flex items-center justify-center overflow-hidden"
      style={{ background: pageBg }}
    >
      {/* Background image */}
      {bgUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${bgUrl})`, opacity: isDark ? 0.18 : 0.12 }}
        />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{ background: gradientOverlay }} />

      {/* Pipeline animation */}
      <PipelineBackground isDark={isDark} />

      {/* Card */}
      <div
        className="relative z-10 mx-4 w-full max-w-md px-8 py-10 rounded-2xl text-center"
        style={{
          background: cardBg,
          border: cardBorder,
          boxShadow: cardShadow,
          backdropFilter: "blur(20px)",
        }}
      >
        {/* Logo — only shows if maintenance_logo_url is set */}
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt={site.site_name}
            className="h-10 mx-auto mb-6 object-contain"
          />
        )}

        {/* Spinning gear icon */}
        <div className="flex justify-center mb-6">
          <svg
            className="w-12 h-12 text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            style={{ animation: "spin 8s linear infinite" }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>

        {/* Title */}
        <h1 className="font-bold text-2xl mb-3 leading-tight" style={{ color: titleColor }}>{title}</h1>

        {/* Message */}
        <p className="text-sm leading-relaxed" style={{ color: msgColor }}>{message}</p>

        {/* Countdown */}
        <Countdown endAt={site.maintenance_end_at} isDark={isDark} />

        {/* Divider + contact */}
        {(email || phone) && (
          <>
            <div className="my-7 h-px" style={{ background: dividerColor }} />
            <p className="text-xs uppercase tracking-widest mb-4" style={{ color: labelColor }}>Get in touch</p>
            <div className="flex flex-col gap-2.5 items-center">
              {email && (
                <a
                  href={`mailto:${email}`}
                  className="group flex items-center gap-2.5 text-sm transition-colors duration-200 hover:text-primary"
                  style={{ color: contactColor }}
                >
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-200"
                    style={{ background: "rgba(204,2,2,0.08)", border: "1px solid rgba(204,2,2,0.18)" }}
                  >
                    <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="4" width="20" height="16" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                  </span>
                  <span className="group-hover:underline underline-offset-2">{email}</span>
                </a>
              )}
              {phone && (
                <a
                  href={`tel:${phone}`}
                  className="group flex items-center gap-2.5 text-sm transition-colors duration-200 hover:text-primary"
                  style={{ color: contactColor }}
                >
                  <span
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors duration-200"
                    style={{ background: "rgba(204,2,2,0.08)", border: "1px solid rgba(204,2,2,0.18)" }}
                  >
                    <svg className="w-3.5 h-3.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.6 3.41 2 2 0 0 1 3.57 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l.92-.92a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </span>
                  <span className="group-hover:underline underline-offset-2">{phone}</span>
                </a>
              )}
            </div>
          </>
        )}
      </div>

      {/* Chat widget — auto-opens with maintenance greeting */}
      <ChatWidget maintenanceActive />
    </div>
  );
}
