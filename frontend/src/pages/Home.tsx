/** Marketing page. Every number on it is a fact about CORD, not a testimonial. */

import { useState } from "react";
import { Link } from "react-router-dom";

import { CtaBand, Eyebrow, Plus, Seal, Section } from "../components/ui";

export default function Home() {
  return (
    <div className="pb-4">
      <Hero />
      <About />
      <Integrations />
      <HowItWorks />
      <Judgments />
      <Faq />
      <Section className="pb-8">
        <CtaBand
          title="Put a delegation on chain and see it settled."
          action="Open the app"
          to="/app"
        />
      </Section>
    </div>
  );
}

/* --- hero --------------------------------------------------------------- */

function Hero() {
  return (
    <Section className="pt-8">
      <div className="card overflow-hidden">
        <div className="grid items-stretch lg:grid-cols-[1.05fr_1fr]">
          {/* copy */}
          <div className="order-2 px-8 py-12 sm:px-12 lg:order-1 lg:py-16">
            <Eyebrow>Authority for agents</Eyebrow>
            <h1 className="h-display mt-4 text-[40px] sm:text-[52px]">
              Delegation may
              <br />
              only shrink.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-mute">
              Even when the limits are written in plain language. CORD settles whether a child
              grant is strictly narrower than its parent — and whether a later action stayed
              inside it, using evidence validators fetch for themselves.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/app" className="btn-primary">
                <Plus /> Open the app
              </Link>
              <Link to="/app/checks" className="btn-ghost">
                Run an access check
              </Link>
            </div>

            <dl className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-slate-100 pt-7">
              {[
                ["8", "max delegation depth"],
                ["2", "GenLayer judgments"],
                ["141", "tests passing"],
              ].map(([n, label]) => (
                <div key={label}>
                  <dt className="text-[28px] font-extrabold tracking-[-0.02em] text-ink">{n}</dt>
                  <dd className="mt-1 text-[12px] leading-snug text-mute">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* visual */}
          <div className="relative order-1 min-h-[300px] overflow-hidden bg-brand lg:order-2 lg:min-h-full">
            <LatticeArt />
            <div className="absolute bottom-7 left-7 right-7">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/70">
                Fail-closed
              </p>
              <p className="mt-1.5 text-[15px] font-semibold leading-snug text-white">
                Every check walks to the root. Revoke a parent and the whole subtree stops
                authorizing, instantly.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

/**
 * The product's own shape: authority narrowing as it descends, drawn as nested
 * arcs and a shrinking delegation chain.
 */
function LatticeArt() {
  return (
    <svg
      viewBox="0 0 420 460"
      className="absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1E3FAE" />
        </linearGradient>
      </defs>
      <rect width="420" height="460" fill="url(#fade)" />

      {/* faint circuitry, as in the reference's tech imagery */}
      <g stroke="white" strokeOpacity=".13" strokeWidth="1.5" fill="none">
        <path d="M-10 90h120l34 34h150l30-30h110" />
        <path d="M-10 370h90l40-40h130l28 28h150" />
        <path d="M60 -10v70l30 30v60" />
        <path d="M330 470v-70l-28-28v-70" />
      </g>
      <g fill="white" fillOpacity=".3">
        {[
          [110, 90], [294, 124], [130, 330], [288, 358], [90, 120], [302, 302],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="3" />
        ))}
      </g>

      {/* nested authority rings */}
      <g transform="translate(210 210)" fill="none" strokeLinecap="round">
        <circle r="128" stroke="white" strokeOpacity=".22" strokeWidth="2" />
        <circle r="97" stroke="white" strokeOpacity=".32" strokeWidth="2.5" />
        <circle r="68" stroke="white" strokeOpacity=".5" strokeWidth="3" />
        <circle r="40" stroke="white" strokeOpacity=".8" strokeWidth="3.5" />
        <circle r="14" fill="white" fillOpacity=".92" stroke="none" />
      </g>

      {/* the chain, each link narrower than the last */}
      <g transform="translate(210 210)">
        {[128, 97, 68, 40].map((r, i) => (
          <g key={r} transform={`rotate(${-52 + i * 10})`}>
            <circle cx={r} cy="0" r={7 - i} fill="white" fillOpacity={0.55 + i * 0.12} />
          </g>
        ))}
      </g>
    </svg>
  );
}


/* --- about split (copy left, framed visual right) ----------------------- */

function About() {
  return (
    <Section className="pt-6">
      <div className="card px-8 py-12 sm:px-12">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.05fr]">
          <div>
            <Eyebrow>About CORD</Eyebrow>
            <h2 className="h-display mt-3 text-[34px] sm:text-[40px]">
              Your agents can
              <br />
              delegate safely
            </h2>

            <div className="mt-8 max-w-md">
              {[
                ["Objective widening never reaches a validator", "check"],
                ["Bonds make a false verdict expensive", "coin"],
                ["Ambiguity stays inactive until the text changes", "lock"],
              ].map(([text, icon]) => (
                <div
                  key={text}
                  className="flex items-center gap-3 border-b border-slate-100 py-3.5 last:border-0"
                >
                  <RowIcon kind={icon as "check" | "coin" | "lock"} />
                  <span className="text-[13px] font-medium text-ink">{text}</span>
                </div>
              ))}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-4">
                <span className="text-[34px] font-extrabold tracking-[-0.03em] text-ink">100%</span>
                <span className="h-9 w-px bg-slate-200" />
                <div>
                  <div className="flex gap-0.5 text-brand">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <svg key={i} viewBox="0 0 20 20" className="h-3.5 w-3.5 fill-current">
                        <path d="M10 1l2.6 5.3 5.9.9-4.3 4.1 1 5.8L10 14.4 4.8 17.1l1-5.8L1.5 7.2l5.9-.9L10 1z" />
                      </svg>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-mute">
                    Fail-closed can_invoke
                  </p>
                </div>
              </div>
            </div>

            <Link to="/app/grants/new" className="btn-primary mt-8">
              <Plus /> Create a root grant
            </Link>
          </div>

          <div className="overflow-hidden rounded-card bg-slate-50 ring-1 ring-slate-200/70">
            <ChainArt />
          </div>
        </div>
      </div>
    </Section>
  );
}

function RowIcon({ kind }: { kind: "check" | "coin" | "lock" }) {
  const paths = {
    check: "M4 10l4.5 4.5L16 6",
    coin: "M10 3v14M6.5 6.5h5a2.5 2.5 0 010 5h-3a2.5 2.5 0 000 5h5",
    lock: "M6 9V6.5a4 4 0 118 0V9M4.5 9h11v7.5h-11V9z",
  };
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-tint">
      <svg viewBox="0 0 20 20" className="h-4 w-4 stroke-brand" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[kind]} />
      </svg>
    </span>
  );
}

/** A delegation chain, each grant strictly inside the one above it. */
function ChainArt() {
  const levels = [
    { label: "ROOT", w: 100, caps: "payments.* · reports.read" },
    { label: "DEPTH 1", w: 82, caps: "payments.* " },
    { label: "DEPTH 2", w: 64, caps: "payments.send" },
    { label: "DEPTH 3", w: 46, caps: "payments.send · capped" },
  ];
  return (
    <div className="flex flex-col items-center gap-3 px-8 py-12">
      {levels.map((l, i) => (
        <div key={l.label} className="w-full" style={{ maxWidth: `${l.w}%` }}>
          <div
            className={`rounded-2xl px-5 py-4 ${
              i === 0 ? "bg-brand text-white" : "bg-white ring-1 ring-slate-200"
            }`}
          >
            <p
              className={`text-[9px] font-bold uppercase tracking-[0.14em] ${
                i === 0 ? "text-white/70" : "text-mute"
              }`}
            >
              {l.label}
            </p>
            <p
              className={`mt-1 truncate font-mono text-[11px] ${
                i === 0 ? "text-white" : "text-ink"
              }`}
            >
              {l.caps}
            </p>
          </div>
          {i < levels.length - 1 && (
            <div className="mx-auto h-3 w-px bg-slate-300" aria-hidden />
          )}
        </div>
      ))}
      <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-mute">
        Narrower at every step
      </p>
    </div>
  );
}

/* --- integrations strip ------------------------------------------------- */

/**
 * The reference's icon-chip strip. Each chip is a capability domain CORD can
 * constrain — these are scope examples, not partner logos.
 */
const CHIP_ICONS = [
  "payments", "reports", "storage", "compute", "email", "calendar", "records", "vendors", "keys",
] as const;

function Integrations() {
  return (
    <Section className="pt-6">
      <div className="card px-8 py-14 text-center sm:px-12">
        <ChipRow from={0} to={9} />

        <div className="my-10 flex justify-center">
          <Seal />
        </div>

        <Eyebrow>Scope domains</Eyebrow>
        <h2 className="h-display mx-auto mt-3 max-w-lg text-[32px] sm:text-[38px]">
          Constrain almost any kind of authority
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-mute">
          Capabilities and resources are opaque tokens with an explicit{" "}
          <code className="rounded bg-slate-50 px-1.5 py-0.5 text-[13px] ring-1 ring-inset ring-slate-200">
            a.b.*
          </code>{" "}
          prefix form. CORD does not care what they mean — only that a child's set is covered by
          its parent's.
        </p>

        <div className="mt-10">
          <ChipRow from={0} to={9} reverse />
        </div>
      </div>
    </Section>
  );
}

function ChipRow({ from, to, reverse }: { from: number; to: number; reverse?: boolean }) {
  const items = CHIP_ICONS.slice(from, to);
  return (
    <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
      {(reverse ? [...items].reverse() : items).map((name, i) => (
        <div key={name} className="chip-square" title={name}>
          <ChipGlyph index={reverse ? items.length - 1 - i : i} />
        </div>
      ))}
    </div>
  );
}

/** Abstract marks in the reference's dark-navy chip style. */
function ChipGlyph({ index }: { index: number }) {
  const c = "fill-ink";
  const glyphs = [
    <path key="a" className={c} d="M16 4l12 6-12 6-12-6 12-6zm0 12l12 6-12 6-12-6 12-6z" />,
    <path key="b" className={c} d="M6 20L20 6h6L12 20H6zm10 6L26 16h2v10H16z" />,
    <path key="c" className={c} d="M16 3l11 6.5v13L16 29 5 22.5v-13L16 3z" />,
    <path key="d" className={c} d="M5 5h10v10H5V5zm12 0h10v10H17V5zM5 17h10v10H5V17zm12 0h10v10H17V17z" />,
    <path key="e" className={c} d="M16 3l12 7v12l-12 7-12-7V10l12-7zm0 6l-7 4v6l7 4 7-4v-6l-7-4z" />,
    <g key="f" className={c}>
      {Array.from({ length: 12 }).map((_, i) => (
        <rect key={i} x="15" y="2" width="2" height="8" rx="1" transform={`rotate(${i * 30} 16 16)`} />
      ))}
    </g>,
    <path key="g" className={c} d="M16 2l4 10 10 4-10 4-4 10-4-10-10-4 10-4 4-10z" />,
    <g key="h" className={c}>
      <circle cx="16" cy="16" r="13" />
      <circle cx="16" cy="16" r="5" className="fill-white" />
    </g>,
    <path key="i" className={c} d="M6 27V5h5l10 14V5h5v22h-5L11 13v14H6z" />,
  ];
  return (
    <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden>
      {glyphs[index % glyphs.length]}
    </svg>
  );
}

/* --- how it works ------------------------------------------------------- */

const STEPS = [
  {
    step: "Step 01",
    title: "Propose a narrower child",
    body: "Capability and resource subsets, depth and expiry are checked deterministically. Objective widening is rejected before any validator is asked to think.",
  },
  {
    step: "Step 02",
    title: "Post a bond and get it reviewed",
    body: "Validators judge the natural-language clauses. Narrower activates the grant and returns the bond; expanding denies it and the bond goes to the party nearly overrun.",
  },
  {
    step: "Step 03",
    title: "Prove a use against live evidence",
    body: "Each validator independently fetches the HTTPS evidence and decides whether the action stayed in scope. Unreachable evidence is inconclusive, never approval.",
  },
];

function HowItWorks() {
  return (
    <Section className="pt-6">
      <div className="card px-8 py-14 sm:px-12">
        <div className="text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="h-display mx-auto mt-3 max-w-lg text-[32px] sm:text-[38px]">
            Cheap checks first, judgment only where it is needed
          </h2>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.step} className="relative">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-tint text-[13px] font-extrabold text-brand">
                  {i + 1}
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-mute">
                  {s.step}
                </span>
              </div>
              <h3 className="mt-5 text-[17px] font-bold tracking-[-0.01em] text-ink">{s.title}</h3>
              <p className="mt-2.5 text-sm leading-relaxed text-mute">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* --- the two judgments -------------------------------------------------- */

/** Full class strings: Tailwind cannot see interpolated class names. */
const TONE: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  rose: "bg-rose-50 text-rose-700 ring-rose-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/20",
};

function Judgments() {
  return (
    <Section className="pt-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-9">
          <Eyebrow>Judgment one</Eyebrow>
          <h3 className="h-display mt-3 text-[26px]">Semantic review</h3>
          <p className="mt-3 text-sm leading-relaxed text-mute">
            After the structured subset check passes, validators read both sides' clauses and
            return one verdict.
          </p>
          <ul className="mt-6 space-y-2.5">
            {[
              ["NARROWER_OR_EQUAL", "grant activates, bond returned", "emerald"],
              ["EXPANDS_AUTHORITY", "denied, bond slashed", "rose"],
              ["AMBIGUOUS", "inactive, clause pair locked", "amber"],
              ["UNVERIFIABLE", "technical failure, retryable, refunded", "sky"],
            ].map(([v, meaning, tone]) => (
              <li key={v} className="flex flex-wrap items-center gap-2.5">
                <code
                  className={`rounded-lg px-2 py-1 text-[11px] font-bold ring-1 ring-inset ${TONE[tone]}`}
                >
                  {v}
                </code>
                <span className="text-[13px] text-mute">{meaning}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="card p-9">
          <Eyebrow>Judgment two</Eyebrow>
          <h3 className="h-display mt-3 text-[26px]">Prove use</h3>
          <p className="mt-3 text-sm leading-relaxed text-mute">
            An agent submits what it did plus HTTPS evidence. Validators fetch that evidence
            themselves — the leader's bytes are never the record.
          </p>
          <ul className="mt-6 space-y-2.5">
            {[
              ["WITHIN_SCOPE", "recorded, bond returned", "emerald"],
              ["OUT_OF_SCOPE", "grant tainted, bond slashed", "rose"],
              ["INCONCLUSIVE", "nothing changes, bond returned", "amber"],
            ].map(([v, meaning, tone]) => (
              <li key={v} className="flex flex-wrap items-center gap-2.5">
                <code
                  className={`rounded-lg px-2 py-1 text-[11px] font-bold ring-1 ring-inset ${TONE[tone]}`}
                >
                  {v}
                </code>
                <span className="text-[13px] text-mute">{meaning}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 border-t border-slate-100 pt-5 text-[13px] leading-relaxed text-mute">
            Nobody is ever charged for a validator's failure to reach an answer.
          </p>
        </div>
      </div>
    </Section>
  );
}

/* --- faq ---------------------------------------------------------------- */

const FAQ = [
  [
    "What stops someone re-rolling an ambiguous verdict?",
    "The clause pair is locked by a fingerprint over normalized text — case, whitespace, quotes and punctuation folded, clause ids excluded. Resubmitting the same wording under a new grant id hits the same lock. Only a material rewording, or a revision of the parent, produces a new fingerprint.",
  ],
  [
    "What happens if the validators disagree?",
    "The judgment raises, and CORD maps that to UNVERIFIABLE or INCONCLUSIVE — inactive, refunded and retryable. A split decision can never activate a grant.",
  ],
  [
    "Can a clause tell the judge what to answer?",
    "All clause text and page content is fenced as untrusted data, with the controlling instruction placed after it. Whatever the model returns is then forced through a canonicalizer: unrecognized output fails closed, and a verdict inconsistent with the clauses it names is downgraded.",
  ],
  [
    "What happens when a parent is revoked?",
    "Its whole subtree stops authorizing immediately. can_invoke walks to the root on every call, so there is no cached state to go stale.",
  ],
  [
    "Is CORD in the execution path?",
    "No. V1 settles authority and prices evidence about what already happened. It is not a tool runner and holds no custodial balances beyond bonds.",
  ],
];

function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section className="pt-6">
      <div className="card px-8 py-14 sm:px-12">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <Eyebrow>FAQ</Eyebrow>
            <h2 className="h-display mt-3 text-[32px] sm:text-[38px]">
              The questions
              <br />
              that decide trust
            </h2>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-mute">
              Every answer here is enforced by a test in the repository.
            </p>
          </div>

          <div className="divide-y divide-slate-100">
            {FAQ.map(([q, a], i) => (
              <div key={q}>
                <button
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                  className="flex w-full items-center justify-between gap-6 py-5 text-left"
                >
                  <span className="text-[15px] font-bold text-ink">{q}</span>
                  <span
                    className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[15px] transition ${
                      open === i ? "rotate-45 bg-brand text-white" : "bg-slate-50 text-mute"
                    }`}
                  >
                    +
                  </span>
                </button>
                {open === i && (
                  <p className="-mt-1 pb-5 pr-12 text-sm leading-relaxed text-mute">{a}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
