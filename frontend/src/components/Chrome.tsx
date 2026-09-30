/** App chrome: top nav, the honest deployment banner, and the footer. */

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

import { checkHealth, connect, currentAccount, hasWallet } from "../lib/chain";
import type { Health } from "../lib/chain";
import { CHAIN_LABEL, EXPLORER, explorerAddress } from "../lib/config";
import { shortAddr } from "../lib/format";
import { Logo, Plus, Wordmark } from "./ui";

/* --- health ------------------------------------------------------------- */

const HealthCtx = createContext<Health>({ state: "checking" });
export const useHealth = () => useContext(HealthCtx);

export function HealthProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<Health>({ state: "checking" });

  useEffect(() => {
    let alive = true;
    checkHealth().then((h) => alive && setHealth(h));
    return () => {
      alive = false;
    };
  }, []);

  return <HealthCtx.Provider value={health}>{children}</HealthCtx.Provider>;
}

/** True only when code is confirmed on chain; every write is gated on it. */
export const useIsLive = () => useHealth().state === "live";

/* --- wallet ------------------------------------------------------------- */

export function useWallet() {
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    currentAccount().then(setAccount);
    const eth = (window as any).ethereum;
    if (!eth?.on) return;
    const onAccounts = (a: string[]) => setAccount(a?.[0] ?? null);
    eth.on("accountsChanged", onAccounts);
    return () => eth.removeListener?.("accountsChanged", onAccounts);
  }, []);

  const doConnect = async () => {
    setError("");
    try {
      setAccount(await connect());
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not connect");
    }
  };

  return { account, connect: doConnect, error, available: hasWallet() };
}

/* --- banner ------------------------------------------------------------- */

/**
 * States are mutually exclusive and evaluated in `checkHealth`. The app never
 * shows data while claiming a state it has not verified.
 */
export function Banner() {
  const health = useHealth();

  const note = (() => {
    switch (health.state) {
      case "checking":
        return { tone: "mute", text: "Checking the contract on Studio Dev…" };
      case "undeployed":
        return {
          tone: "amber",
          text: "Not deployed. No contract address is configured, so there is nothing on chain to read.",
        };
      case "rpc-down":
        return { tone: "rose", text: `Studio Dev RPC is unreachable — ${health.detail}` };
      case "wrong-chain":
        return {
          tone: "rose",
          text: `RPC reported chain ${health.found}. CORD targets 61997 only.`,
        };
      case "no-code":
        return {
          tone: "amber",
          text: "No code at the configured address. Studio Dev state was most likely reset.",
        };
      case "live":
        return { tone: "brand", text: "" };
    }
  })();

  if (health.state === "live") {
    return (
      <div className="border-b border-slate-200/70 bg-white/70">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-5 py-2 text-[12px]">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span className="font-semibold text-ink">Live</span>
          <a
            href={explorerAddress(health.address)}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-mute underline decoration-slate-300 underline-offset-2 hover:text-brand"
          >
            {shortAddr(health.address)}
          </a>
        </div>
      </div>
    );
  }

  const tone =
    note.tone === "rose"
      ? "bg-rose-50 text-rose-800 border-rose-100"
      : note.tone === "amber"
        ? "bg-amber-50 text-amber-900 border-amber-100"
        : "bg-white/70 text-mute border-slate-200/70";

  return (
    <div className={`border-b ${tone}`}>
      <div className="mx-auto flex max-w-6xl items-center gap-2.5 px-5 py-2 text-[12px] font-medium">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-60" />
        <span>{note.text}</span>
      </div>
    </div>
  );
}

/* --- nav ---------------------------------------------------------------- */

const LINKS = [
  { to: "/app", label: "Grants", end: true },
  { to: "/app/checks", label: "Access check", end: false },
  { to: "/app/activity", label: "Activity", end: false },
];

export function Nav() {
  const { account, connect: doConnect, available } = useWallet();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3.5">
        <Wordmark />

        <nav className="ml-2 hidden items-center gap-1 md:flex">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-[12px] font-bold uppercase tracking-[0.1em] transition ${
                  isActive ? "bg-brand-tint text-brand" : "text-mute hover:text-ink"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          <span className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-mute sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            {CHAIN_LABEL}
          </span>

          {account ? (
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[12px] text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {shortAddr(account)}
            </span>
          ) : (
            <button
              onClick={doConnect}
              disabled={!available}
              className="btn-primary"
              title={available ? "Connect an injected wallet" : "No injected wallet found"}
            >
              <Plus /> Connect
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

/* --- footer ------------------------------------------------------------- */

export function Footer() {
  return (
    <footer className="mt-16 bg-brand">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <Logo className="h-7 w-7 text-white" />
              <span className="text-[19px] font-extrabold tracking-[-0.02em] text-white">CORD</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/70">
              Constraint On Recursive Delegation. An authority lattice for agents, settled on
              GenLayer.
            </p>
            <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.12em] text-white/60">
              Studio Dev · chain 61997
            </p>
          </div>

          <FooterCol
            title="Product"
            links={[
              ["Grants", "/app"],
              ["Create a root", "/app/grants/new"],
              ["Access check", "/app/checks"],
              ["Activity", "/app/activity"],
            ]}
          />

          <div>
            <p className="mb-4 text-[13px] font-bold text-white">Network</p>
            <ul className="space-y-2.5 text-sm text-white/70">
              <li>
                <a href={EXPLORER} target="_blank" rel="noreferrer" className="hover:text-white">
                  Explorer
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/Fortune9thx/CORD"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white"
                >
                  Source
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/Fortune9thx/CORD/blob/main/deploy/deployments.json"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white"
                >
                  Deployment status
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/15 pt-6 text-[12px] text-white/60 sm:flex-row sm:items-center sm:justify-between">
          <span>MIT licensed. Studio Dev state may reset.</span>
          <span>Delegation may only shrink.</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="mb-4 text-[13px] font-bold text-white">{title}</p>
      <ul className="space-y-2.5 text-sm text-white/70">
        {links.map(([label, to]) => (
          <li key={to}>
            <NavLink to={to} className="hover:text-white">
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
