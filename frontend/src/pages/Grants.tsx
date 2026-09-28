/** Grants board. Reads the chain; renders nothing it did not read. */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useHealth } from "../components/Chrome";
import { Empty, ErrorNote, Eyebrow, Plus, Section, Spinner, StatusPill, TokenList } from "../components/ui";
import { listGrants } from "../lib/chain";
import { fmtDate, relativeExpiry, shortAddr } from "../lib/format";
import type { Grant } from "../lib/types";

export default function Grants() {
  const health = useHealth();
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (health.state === "checking") return;
    if (health.state !== "live") {
      // Nothing is readable, and nothing is invented to fill the gap.
      setGrants([]);
      return;
    }
    let alive = true;
    listGrants()
      .then((g) => alive && setGrants(g))
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
    };
  }, [health.state]);

  const counts = grants
    ? {
        all: grants.length,
        active: grants.filter((g) => g.effective).length,
        pending: grants.filter((g) => g.status === "PROPOSED").length,
      }
    : null;

  return (
    <Section className="py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>On chain</Eyebrow>
          <h1 className="h-display mt-2.5 text-[34px]">Grants</h1>
          <p className="mt-2 text-sm text-mute">
            Every grant the contract has issued, newest first.
          </p>
        </div>
        <Link to="/app/grants/new" className="btn-primary">
          <Plus /> Create a root grant
        </Link>
      </div>

      {counts && counts.all > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Stat label="Grants issued" value={counts.all} />
          <Stat label="Effective now" value={counts.active} />
          <Stat label="Awaiting review" value={counts.pending} />
        </div>
      )}

      <div className="mt-6 space-y-4">
        {error ? (
          <ErrorNote error={error} />
        ) : grants === null ? (
          <Spinner />
        ) : grants.length === 0 ? (
          <Empty
            title="No grants on chain yet"
            hint={
              health.state === "live"
                ? "Create a root grant to start a delegation chain."
                : "Nothing can be read until the contract is live on Studio Dev."
            }
          />
        ) : (
          grants.map((g) => <GrantRow key={g.id} grant={g} />)
        )}
      </div>
    </Section>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-6">
      <p className="text-[32px] font-extrabold tracking-[-0.02em] text-ink">{value}</p>
      <p className="mt-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-mute">{label}</p>
    </div>
  );
}

export function GrantRow({ grant }: { grant: Grant }) {
  return (
    <Link
      to={`/app/grants/${grant.id}`}
      className="card block p-6 transition hover:shadow-lift"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[13px] font-bold text-ink">{grant.id}</span>
            <StatusPill status={grant.effective_status} />
            {grant.tainted && (
              <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-rose-700 ring-1 ring-inset ring-rose-600/20">
                Tainted
              </span>
            )}
            <span className="text-[12px] text-mute">depth {grant.depth}</span>
          </div>

          <p className="mt-3 text-[13px] text-mute">
            <span className="text-slate-400">grantee</span>{" "}
            <span className="font-mono text-ink">{shortAddr(grant.grantee)}</span>
            {grant.parent_id && (
              <>
                <span className="mx-2 text-slate-300">·</span>
                <span className="text-slate-400">child of</span>{" "}
                <span className="font-mono text-ink">{grant.parent_id}</span>
              </>
            )}
          </p>

          <div className="mt-4">
            <TokenList tokens={grant.capabilities} />
          </div>
        </div>

        <div className="text-right">
          <p className="text-[12px] font-semibold text-ink">{relativeExpiry(grant.expiry)}</p>
          <p className="mt-1 text-[12px] text-mute">expires {fmtDate(grant.expiry)}</p>
          {!grant.effective && grant.effective_reason && (
            <p className="mt-2 max-w-[220px] text-[11px] leading-snug text-rose-600">
              {grant.effective_reason}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
