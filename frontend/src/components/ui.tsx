/** The reference layout's recurring pieces, built once. */

import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { GrantStatus, ReviewVerdict, UseDecision } from "../lib/types";

/* --- page canvas -------------------------------------------------------- */

/**
 * The soft gray canvas with the reference's faint abstract blobs behind it.
 * Purely decorative and non-interactive.
 */
export function Blobs() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-white/50 blur-3xl" />
      <div className="absolute -right-32 top-[38%] h-[460px] w-[460px] rounded-full bg-brand/[0.06] blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-[420px] w-[420px] rounded-full bg-white/40 blur-3xl" />
      <svg className="absolute -left-24 top-1/4 h-[380px] w-[380px] text-white/60" viewBox="0 0 200 200">
        <path
          fill="currentColor"
          d="M45 -60C58 -49 67 -33 71 -15C74 3 72 22 62 37C52 52 34 62 14 68C-6 73 -28 73 -46 63C-64 53 -78 33 -81 12C-84 -10 -76 -33 -61 -49C-46 -65 -25 -73 -4 -70C17 -67 32 -71 45 -60Z"
          transform="translate(100 100)"
        />
      </svg>
    </div>
  );
}

export function Section({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`mx-auto w-full max-w-6xl px-5 ${className}`}>{children}</section>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="eyebrow">{children}</p>;
}

/* --- the circular seal from the reference ------------------------------- */

export function Seal({ size = 112 }: { size?: number }) {
  const text = "CORD · DELEGATION MAY ONLY SHRINK · STUDIO DEV 61997 · ";
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 animate-spinslow">
        <defs>
          <path id="seal-arc" d="M50,50 m-37,0 a37,37 0 1,1 74,0 a37,37 0 1,1 -74,0" />
        </defs>
        <text className="fill-mute" style={{ fontSize: 6.4, letterSpacing: 1.05, fontWeight: 700 }}>
          <textPath href="#seal-arc">{text}</textPath>
        </text>
      </svg>
      <div className="absolute inset-0 rounded-full border border-slate-200/80" />
      <Logo className="h-6 w-6 text-brand" />
    </div>
  );
}

/** CORD's own mark: three nested rings, each strictly inside the last. */
export function Logo({ className = "h-7 w-7 text-brand" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="13.5" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth="3" opacity=".62" />
      <circle cx="16" cy="16" r="3" fill="currentColor" opacity=".35" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <Logo className="h-7 w-7 text-brand" />
      <span className="text-[19px] font-extrabold tracking-[-0.02em] text-ink">CORD</span>
    </Link>
  );
}

/* --- status pills ------------------------------------------------------- */

const STATUS_STYLE: Record<GrantStatus, string> = {
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  PROPOSED: "bg-slate-100 text-slate-600 ring-slate-500/20",
  DENIED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  AMBIGUOUS: "bg-amber-50 text-amber-700 ring-amber-600/20",
  RETRYABLE: "bg-sky-50 text-sky-700 ring-sky-600/20",
  REVOKED: "bg-rose-50 text-rose-700 ring-rose-600/20",
  EXPIRED: "bg-slate-100 text-slate-500 ring-slate-500/20",
};

export function StatusPill({ status }: { status: GrantStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${
        STATUS_STYLE[status] ?? STATUS_STYLE.PROPOSED
      }`}
    >
      {status}
    </span>
  );
}

const VERDICT_STYLE: Record<ReviewVerdict | UseDecision, string> = {
  NARROWER_OR_EQUAL: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  EXPANDS_AUTHORITY: "bg-rose-50 text-rose-700 ring-rose-600/20",
  AMBIGUOUS: "bg-amber-50 text-amber-700 ring-amber-600/20",
  UNVERIFIABLE: "bg-sky-50 text-sky-700 ring-sky-600/20",
  WITHIN_SCOPE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  OUT_OF_SCOPE: "bg-rose-50 text-rose-700 ring-rose-600/20",
  INCONCLUSIVE: "bg-amber-50 text-amber-700 ring-amber-600/20",
};

export function VerdictPill({ verdict }: { verdict: ReviewVerdict | UseDecision }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${
        VERDICT_STYLE[verdict] ?? VERDICT_STYLE.INCONCLUSIVE
      }`}
    >
      {verdict.replace(/_/g, " ")}
    </span>
  );
}

/* --- small building blocks --------------------------------------------- */

export function TokenList({ tokens }: { tokens: string[] }) {
  if (!tokens?.length) return <span className="text-sm text-slate-400">none</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tokens.map((t) => (
        <code
          key={t}
          className="rounded-lg bg-slate-50 px-2 py-1 text-[12px] font-medium text-slate-700 ring-1 ring-inset ring-slate-200"
        >
          {t}
        </code>
      ))}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="text-sm text-ink">{children}</div>
    </div>
  );
}

/** Every empty state lives inside a card and says plainly that nothing is there. */
export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card p-10 text-center">
      <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-tint">
        <Logo className="h-6 w-6 text-brand" />
      </div>
      <p className="text-[15px] font-bold text-ink">{title}</p>
      {hint && <p className="mx-auto mt-1.5 max-w-md text-sm text-mute">{hint}</p>}
    </div>
  );
}

export function Spinner({ label = "Reading the chain…" }: { label?: string }) {
  return (
    <div className="card flex items-center justify-center gap-3 p-10 text-sm text-mute">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
      {label}
    </div>
  );
}

export function ErrorNote({ error }: { error: string }) {
  return (
    <div className="card border border-rose-100 p-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-rose-600">
        Could not read the chain
      </p>
      <p className="mt-2 break-words text-sm text-mute">{error}</p>
    </div>
  );
}

/** The blue CTA band that closes the reference pages. */
export function CtaBand({
  title,
  action,
  to,
}: {
  title: string;
  action: string;
  to: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-card bg-brand px-8 py-8 sm:px-10">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 h-full w-[420px] text-white/10"
        viewBox="0 0 400 160"
        fill="none"
      >
        <path d="M40 130h90l30-30h80l30-30h120" stroke="currentColor" strokeWidth="2" />
        <path d="M0 40h70l26 26h120" stroke="currentColor" strokeWidth="2" />
        <circle cx="130" cy="130" r="4" fill="currentColor" />
        <circle cx="216" cy="66" r="4" fill="currentColor" />
        <circle cx="290" cy="70" r="4" fill="currentColor" />
      </svg>
      <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <RingStack />
          <p className="max-w-sm text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-white">
            {title}
          </p>
        </div>
        <Link to={to} className="btn-white shrink-0">
          <Plus /> {action}
        </Link>
      </div>
    </div>
  );
}

/**
 * Stands in for the reference's avatar cluster. CORD has no testimonials to
 * show, so the same shape carries the three nesting rings instead.
 */
function RingStack() {
  return (
    <div className="flex -space-x-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="grid h-11 w-11 place-items-center rounded-full border-2 border-brand bg-brand-deep"
        >
          <svg viewBox="0 0 32 32" className="h-5 w-5 text-white" aria-hidden>
            <circle
              cx="16"
              cy="16"
              r={13 - i * 4}
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              opacity={1 - i * 0.22}
            />
          </svg>
        </span>
      ))}
    </div>
  );
}

export function Plus() {
  return <span className="text-[14px] leading-none">+</span>;
}
