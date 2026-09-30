/** Grant detail: scope, clauses, the settled verdict, uses, and the actions. */

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useHealth } from "../components/Chrome";
import { TxButton } from "../components/Forms";
import {
  Empty,
  ErrorNote,
  Eyebrow,
  Field,
  Plus,
  Section,
  Spinner,
  StatusPill,
  TokenList,
  VerdictPill,
} from "../components/ui";
import { getChildren, getConfig, getGrant, getReview, getUse, getUses, grantIdWasIssued } from "../lib/chain";
import { fmtDate, fmtDateTime, fmtGen, relativeExpiry, shortAddr } from "../lib/format";
import type { Grant, Review, UseRecord } from "../lib/types";

export default function GrantDetail() {
  const { id = "" } = useParams();
  const health = useHealth();

  const [grant, setGrant] = useState<Grant | null | "missing" | "finalizing">(null);
  const [review, setReview] = useState<Review | null>(null);
  const [children, setChildren] = useState<string[]>([]);
  const [uses, setUses] = useState<UseRecord[]>([]);
  // The contract's bonds are set once at construction and can differ from
  // deployment to deployment (create_root takes them as constructor args).
  // Hardcoding the amount this button attaches would silently send the
  // wrong value against any instance configured differently from the one
  // this UI happened to be built against.
  const [reviewBond, setReviewBond] = useState<bigint | null>(null);
  const [challengeBond, setChallengeBond] = useState<bigint | null>(null);
  const [error, setError] = useState("");

  /** Exposed so a settled write refreshes this page before reporting success. */
  const reload = useCallback(async () => {
    if (health.state === "checking") return;
    if (health.state !== "live") {
      setGrant("missing");
      return;
    }
    try {
      const g = await getGrant(id);
      if (!g) {
        // A direct read failing does not mean the grant never existed — a
        // freshly created one can be unreadable while it finalizes. Ask a
        // cheaper source whether the contract has issued this id at all, and
        // only call it missing when both say no.
        const issued = await grantIdWasIssued(id).catch(() => false);
        setGrant(issued ? "finalizing" : "missing");
        return;
      }
      setGrant(g);

      const [r, kids, useIds] = await Promise.all([
        getReview(id).catch(() => null),
        getChildren(id).catch(() => []),
        getUses(id).catch(() => []),
      ]);
      setReview(r);
      setChildren(kids);

      const records = await Promise.all(useIds.map((u) => getUse(u).catch(() => null)));
      setUses(records.filter((u): u is UseRecord => Boolean(u)));

      const cfg = await getConfig().catch(() => null);
      setReviewBond(cfg?.review_bond ? BigInt(cfg.review_bond as string) : null);
      setChallengeBond(cfg?.challenge_bond ? BigInt(cfg.challenge_bond as string) : null);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id, health.state]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (error) return <Section className="py-8"><ErrorNote error={error} /></Section>;
  if (grant === null) return <Section className="py-8"><Spinner /></Section>;
  if (grant === "finalizing")
    return (
      <Section className="py-8">
        <div className="card p-10 text-center">
          <span className="mx-auto mb-4 block h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
          <p className="text-[15px] font-bold text-ink">Finalizing on chain</p>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-mute">
            The contract has issued <span className="font-mono">{id}</span>, but it is not
            readable yet. This is normal shortly after creation.
          </p>
          <button onClick={() => void reload()} className="btn-ghost mt-6">
            Check again
          </button>
        </div>
      </Section>
    );

  if (grant === "missing")
    return (
      <Section className="py-8">
        <Empty
          title="Grant not readable"
          hint={
            health.state === "live"
              ? `Nothing on chain answers to ${id}.`
              : "Nothing can be read until the contract is live on Studio Dev."
          }
        />
      </Section>
    );

  return (
    <Section className="space-y-6 py-8">
      {/* header */}
      <div className="card p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Eyebrow>Grant</Eyebrow>
            <div className="mt-2.5 flex flex-wrap items-center gap-3">
              <h1 className="h-display font-mono text-[30px]">{grant.id}</h1>
              <StatusPill status={grant.effective_status} />
              {grant.tainted && (
                <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-rose-700 ring-1 ring-inset ring-rose-600/20">
                  Tainted
                </span>
              )}
            </div>

            <p
              className={`mt-3 text-sm font-semibold ${
                grant.effective ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {grant.effective
                ? "Effective — this grant currently authorizes its scope."
                : `Not effective — ${grant.effective_reason || "inactive"}.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {grant.effective && (
              <>
                <Link to={`/app/delegate/${grant.id}`} className="btn-primary">
                  <Plus /> Delegate
                </Link>
                <Link to={`/app/prove/${grant.id}`} className="btn-ghost">
                  Prove a use
                </Link>
              </>
            )}
            {["AMBIGUOUS", "DENIED", "RETRYABLE"].includes(grant.status) && (
              <Link to={`/app/revise/${grant.id}`} className="btn-primary">
                <Plus /> Revise
              </Link>
            )}
          </div>
        </div>

        <div className="mt-8 grid gap-6 border-t border-slate-100 pt-7 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Grantee">
            <span className="font-mono">{shortAddr(grant.grantee)}</span>
          </Field>
          <Field label="Grantor">
            <span className="font-mono">{shortAddr(grant.grantor)}</span>
          </Field>
          <Field label="Depth">
            {grant.depth}
            {grant.parent_id && (
              <>
                {" · child of "}
                <Link to={`/app/grants/${grant.parent_id}`} className="font-mono text-brand hover:underline">
                  {grant.parent_id}
                </Link>
              </>
            )}
          </Field>
          <Field label="Expiry">
            {fmtDate(grant.expiry)}
            <span className="ml-1.5 text-mute">({relativeExpiry(grant.expiry)})</span>
          </Field>
        </div>
      </div>

      {/* scope */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">
            Structured scope
          </p>
          <p className="mt-2 text-[12px] text-mute">Checked deterministically, before any judgment.</p>
          <div className="mt-6 space-y-5">
            <div>
              <p className="label">Capabilities</p>
              <TokenList tokens={grant.capabilities} />
            </div>
            <div>
              <p className="label">Resources</p>
              <TokenList tokens={grant.resources} />
            </div>
            <div>
              <p className="label">Scope fingerprint</p>
              <code className="block break-all rounded-lg bg-slate-50 p-2.5 font-mono text-[11px] text-mute">
                {grant.scope_fingerprint}
              </code>
            </div>
          </div>
        </div>

        <div className="card p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">Clauses</p>
          <p className="mt-2 text-[12px] text-mute">
            The natural language validators judge. Flagged ids come from the settled verdict.
          </p>

          {grant.clauses.length === 0 ? (
            <p className="mt-6 text-sm text-slate-400">No clauses on this grant.</p>
          ) : (
            <ul className="mt-6 space-y-3">
              {grant.clauses.map((c) => {
                const expanding = review?.expansion_clause_ids?.includes(c.id);
                const unclear = review?.ambiguity_clause_ids?.includes(c.id);
                return (
                  <li
                    key={c.id}
                    className={`rounded-xl p-4 ring-1 ring-inset ${
                      expanding
                        ? "bg-rose-50 ring-rose-600/20"
                        : unclear
                          ? "bg-amber-50 ring-amber-600/20"
                          : "bg-slate-50 ring-slate-200"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-bold text-brand">{c.id}</span>
                      {expanding && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-rose-700">
                          expands authority
                        </span>
                      )}
                      {unclear && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">
                          ambiguous
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[13px] leading-relaxed text-ink">{c.text}</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* verdict */}
      <div className="card p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">
          GenLayer verdict
        </p>

        {!review ? (
          <p className="mt-4 text-sm text-mute">
            {grant.status === "PROPOSED"
              ? "Not yet reviewed. This grant confers nothing until a bonded review settles it."
              : "No review recorded for this grant."}
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <VerdictPill verdict={review.verdict} />
              <span className="text-[12px] font-semibold uppercase tracking-[0.1em] text-mute">
                via {review.kind}
              </span>
              <span className="text-[12px] text-mute">{fmtDateTime(review.settled_at)}</span>
            </div>

            <div className="mt-6 grid gap-6 border-t border-slate-100 pt-6 sm:grid-cols-3">
              <Field label="Bond posted">{fmtGen(review.bond)} GEN</Field>
              <Field label="Slashed">
                <span className={review.slashed > 0 ? "font-semibold text-rose-700" : ""}>
                  {fmtGen(review.slashed)} GEN
                </span>
              </Field>
              <Field label="Prohibitions covered">
                {review.prohibitions_covered ? "yes" : "no"}
              </Field>
            </div>

            {review.kind === "challenge" && (
              <p className="mt-5 text-[13px] text-mute">
                Challenged by <span className="font-mono">{shortAddr(review.challenger)}</span> —{" "}
                {review.upheld ? "upheld, the grant was revoked." : "not upheld."}
              </p>
            )}
          </>
        )}

        <div className="mt-8 flex flex-wrap gap-3 border-t border-slate-100 pt-7">
          {grant.status === "PROPOSED" && reviewBond !== null && (
            <TxButton
              method="request_review"
              args={[grant.id]}
              value={reviewBond}
              onDone={reload}
            >
              + Request review ({fmtGen(reviewBond)} GEN bond)
            </TxButton>
          )}
          {grant.effective_status === "ACTIVE" && grant.parent_id && challengeBond !== null && (
            <TxButton
              method="challenge"
              args={[grant.id]}
              value={challengeBond}
              onDone={reload}
            >
              + Challenge ({fmtGen(challengeBond)} GEN bond)
            </TxButton>
          )}
          {grant.status !== "REVOKED" && (
            <TxButton method="revoke" args={[grant.id]} onDone={reload}>
              Revoke
            </TxButton>
          )}
          {grant.tainted && (
            <TxButton method="clear_taint" args={[grant.id]} onDone={reload}>
              Clear taint
            </TxButton>
          )}
        </div>
      </div>

      {/* uses */}
      <div className="card p-8">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">
            Proven uses
          </p>
          {grant.effective && (
            <Link to={`/app/prove/${grant.id}`} className="text-[12px] font-bold uppercase tracking-[0.1em] text-brand hover:underline">
              Prove a use
            </Link>
          )}
        </div>

        {uses.length === 0 ? (
          <p className="mt-4 text-sm text-mute">No uses have been submitted for judgment.</p>
        ) : (
          <ul className="mt-6 space-y-4">
            {uses.map((u) => (
              <li key={u.id} className="rounded-xl bg-slate-50 p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <VerdictPill verdict={u.decision} />
                  <span className="font-mono text-[12px] text-mute">{u.id}</span>
                  <span className="text-[12px] text-mute">{fmtDateTime(u.settled_at)}</span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-ink">{u.action}</p>
                <ul className="mt-3 space-y-1">
                  {u.evidence_urls.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-all font-mono text-[11px] text-brand hover:underline"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
                {u.violated_clause_ids.length > 0 && (
                  <p className="mt-3 text-[12px] text-rose-700">
                    Violated: {u.violated_clause_ids.join(", ")}
                  </p>
                )}
                {u.slashed > 0 && (
                  <p className="mt-1.5 text-[12px] font-semibold text-rose-700">
                    {fmtGen(u.slashed)} GEN slashed
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* children */}
      <div className="card p-8">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">
          Delegated from this grant
        </p>
        {children.length === 0 ? (
          <p className="mt-4 text-sm text-mute">Nothing has been delegated from this grant.</p>
        ) : (
          <div className="mt-5 flex flex-wrap gap-2.5">
            {children.map((c) => (
              <Link
                key={c}
                to={`/app/grants/${c}`}
                className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-mono text-[13px] text-ink transition hover:border-brand hover:text-brand"
              >
                {c}
              </Link>
            ))}
          </div>
        )}
      </div>
    </Section>
  );
}
