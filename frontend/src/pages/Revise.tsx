/**
 * Revise an inactive proposal.
 *
 * This is the documented way out of AMBIGUOUS, DENIED and RETRYABLE. Without
 * it those statuses are dead ends in the app even though the contract offers a
 * path back, so the page exists to make that path reachable.
 */

import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { useHealth } from "../components/Chrome";
import {
  ClauseEditor,
  ExpiryInput,
  FormCard,
  TokenInput,
  TxButton,
  parseTokens,
  toUnix,
} from "../components/Forms";
import type { Clause } from "../components/Forms";
import { Empty, Section, Spinner, VerdictPill } from "../components/ui";
import { getGrant, getReview } from "../lib/chain";
import { fmtDate } from "../lib/format";
import type { Grant, Review } from "../lib/types";

const REVISABLE = ["AMBIGUOUS", "DENIED", "RETRYABLE", "PROPOSED"];

export default function Revise() {
  const { id = "" } = useParams();
  const health = useHealth();
  const [grant, setGrant] = useState<Grant | null | "missing">(null);
  const [review, setReview] = useState<Review | null>(null);

  const [caps, setCaps] = useState("");
  const [res, setRes] = useState("");
  const [expiry, setExpiry] = useState("");
  const [clauses, setClauses] = useState<Clause[]>([]);

  const reload = useCallback(async () => {
    if (health.state === "checking") return;
    if (health.state !== "live") {
      setGrant("missing");
      return;
    }
    try {
      const g = await getGrant(id);
      if (!g) {
        setGrant("missing");
        return;
      }
      setGrant(g);
      setReview(await getReview(id).catch(() => null));
      setCaps(g.capabilities.join(", "));
      setRes(g.resources.join(", "));
      setClauses(g.clauses.length ? g.clauses : [{ id: "c1", text: "" }]);
      setExpiry(new Date(g.expiry * 1000).toISOString().slice(0, 10));
    } catch {
      setGrant("missing");
    }
  }, [id, health.state]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (grant === null) return <Section className="py-8"><Spinner /></Section>;
  if (grant === "missing")
    return (
      <Section className="py-8">
        <Empty title="Grant not readable" hint={`Nothing on chain answers to ${id}.`} />
      </Section>
    );

  if (!REVISABLE.includes(grant.status)) {
    return (
      <Section className="py-8">
        <Empty
          title="This grant cannot be revised"
          hint={`Only an inactive proposal can be rewritten. ${grant.id} is ${grant.status}.`}
        />
      </Section>
    );
  }

  const flagged = new Set([
    ...(review?.expansion_clause_ids ?? []),
    ...(review?.ambiguity_clause_ids ?? []),
  ]);

  const ready = Boolean(parseTokens(caps).length && parseTokens(res).length && expiry);

  return (
    <Section className="py-8">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <FormCard
          title="Revise this proposal"
          lead="Rewriting bumps the grant's version and returns it to PROPOSED for a fresh review. Rewording it to the same meaning will hit the same lock — the text has to change materially."
        >
          <TokenInput
            label="Capabilities"
            value={caps}
            onChange={setCaps}
            placeholder="payments.send"
            hint="Still has to be covered by the parent's set."
          />
          <TokenInput
            label="Resources"
            value={res}
            onChange={setRes}
            placeholder="acct.ops"
            hint="Still has to be covered by the parent's set."
          />
          <ExpiryInput value={expiry} onChange={setExpiry} />
          <ClauseEditor clauses={clauses} onChange={setClauses} />

          <TxButton
            disabled={!ready}
            method="revise_child"
            args={() => [
              id,
              parseTokens(caps),
              parseTokens(res),
              toUnix(expiry),
              clauses.filter((c) => c.text.trim()),
            ]}
            onDone={reload}
          >
            + Submit revision
          </TxButton>
        </FormCard>

        <div className="card h-fit p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">
            Why it was not activated
          </p>

          {!review ? (
            <p className="mt-4 text-sm text-mute">No review recorded.</p>
          ) : (
            <>
              <div className="mt-3">
                <VerdictPill verdict={review.verdict} />
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-mute">
                {review.verdict === "AMBIGUOUS"
                  ? "Validators could not settle what the flagged clauses mean. The clause pair is locked until the text materially changes — clearer wording is the way through, not resubmitting."
                  : review.verdict === "EXPANDS_AUTHORITY"
                    ? "The flagged clauses claimed authority the parent does not hold. Narrow them."
                    : "The judgment could not be completed. This is a technical failure, not a finding — revising and resubmitting is safe."}
              </p>

              {flagged.size > 0 && (
                <div className="mt-6">
                  <p className="label">Clauses to change</p>
                  <ul className="space-y-2.5">
                    {grant.clauses
                      .filter((c) => flagged.has(c.id))
                      .map((c) => (
                        <li key={c.id} className="rounded-lg bg-amber-50 p-3 ring-1 ring-inset ring-amber-600/20">
                          <span className="font-mono text-[11px] font-bold text-amber-700">
                            {c.id}
                          </span>
                          <p className="mt-1 text-[13px] leading-relaxed text-ink">{c.text}</p>
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </>
          )}

          <div className="mt-6 border-t border-slate-100 pt-5 text-[12px] text-mute">
            <p>
              Version {grant.version} · expires {fmtDate(grant.expiry)}
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}
