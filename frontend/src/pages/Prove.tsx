/** Submit an action plus HTTPS evidence for validators to judge. */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { useHealth } from "../components/Chrome";
import { FormCard, TxButton } from "../components/Forms";
import { Empty, Section, Spinner, TokenList } from "../components/ui";
import { getGrant, write } from "../lib/chain";
import { MAX_ACTION_CHARS, MAX_EVIDENCE_URLS } from "../lib/limits";
import type { Grant } from "../lib/types";

/** Mirrors the contract's allowlist so obvious mistakes are caught before gas. */
function urlProblem(u: string): string | null {
  if (!u.toLowerCase().startsWith("https://")) return "must use https";
  let host: string;
  try {
    host = new URL(u).hostname.toLowerCase();
  } catch {
    return "not a valid url";
  }
  if (u.includes("@")) return "must not contain credentials";
  const port = new URL(u).port;
  if (port && port !== "443") return "must use the default https port";
  if (!host.includes(".")) return "host is not a public domain";
  if (
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0)/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  )
    return "host is not public";
  return null;
}

export default function Prove() {
  const { id = "" } = useParams();
  const health = useHealth();
  const [grant, setGrant] = useState<Grant | null | "missing">(null);
  const [action, setAction] = useState("");
  const [urls, setUrls] = useState<string[]>([""]);

  useEffect(() => {
    if (health.state !== "live") return setGrant("missing");
    getGrant(id).then((g) => setGrant(g ?? "missing")).catch(() => setGrant("missing"));
  }, [id, health.state]);

  if (grant === null) return <Section className="py-8"><Spinner /></Section>;
  if (grant === "missing")
    return (
      <Section className="py-8">
        <Empty title="Grant not readable" hint={`Nothing on chain answers to ${id}.`} />
      </Section>
    );

  const clean = urls.map((u) => u.trim()).filter(Boolean);
  const problems = clean.map(urlProblem);
  const ready = Boolean(action.trim()) && clean.length > 0 && problems.every((p) => p === null);

  return (
    <Section className="py-8">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <FormCard
          title="Prove a use"
          lead="Describe what you did and link the evidence. Each validator fetches these pages independently and decides whether the action stayed inside the grant."
        >
          <div>
            <p className="label">What the agent did</p>
            <textarea
              value={action}
              onChange={(e) => setAction(e.target.value)}
              rows={4}
              maxLength={MAX_ACTION_CHARS}
              placeholder="e.g. Paid invoice #8891 to the hosting provider for $120 on 14 March."
              className="field resize-y"
            />
            <p className="mt-2 text-[12px] text-mute">
              {action.length}/{MAX_ACTION_CHARS}. Validators judge the evidence, not this
              description — it only tells them what to look for.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <p className="label mb-0">Evidence URLs</p>
              <span className="text-[11px] text-mute">
                {clean.length}/{MAX_EVIDENCE_URLS}
              </span>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed text-mute">
              Public HTTPS only. Loopback, private and link-local hosts are rejected, so evidence
              fetching cannot be aimed at a validator's own network.
            </p>

            <div className="mt-4 space-y-2.5">
              {urls.map((u, i) => {
                const problem = u.trim() ? urlProblem(u.trim()) : null;
                return (
                  <div key={i}>
                    <div className="flex gap-2">
                      <input
                        value={u}
                        onChange={(e) =>
                          setUrls(urls.map((x, j) => (j === i ? e.target.value : x)))
                        }
                        placeholder="https://vendor.example.com/invoice/8891"
                        className="field font-mono text-[12px]"
                      />
                      {urls.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setUrls(urls.filter((_, j) => j !== i))}
                          className="btn-ghost shrink-0"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                    {problem && <p className="mt-1.5 text-[12px] text-rose-600">{problem}</p>}
                  </div>
                );
              })}
            </div>

            {urls.length < MAX_EVIDENCE_URLS && (
              <button type="button" onClick={() => setUrls([...urls, ""])} className="btn-ghost mt-3">
                + Add URL
              </button>
            )}
          </div>

          <TxButton disabled={!ready} onRun={() => write("prove_use", [id, action.trim(), clean])}>
            + Submit for judgment
          </TxButton>

          <p className="text-[12px] leading-relaxed text-mute">
            If the evidence cannot be reached, or does not settle the question, the result is
            inconclusive and any bond is returned in full.
          </p>
        </FormCard>

        <div className="card h-fit p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">
            Judged against
          </p>
          <p className="mt-2 font-mono text-[15px] font-bold text-ink">{grant.id}</p>

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
              <p className="label">Clauses</p>
              {grant.clauses.length === 0 ? (
                <p className="text-sm text-slate-400">none</p>
              ) : (
                <ul className="space-y-2.5">
                  {grant.clauses.map((c) => (
                    <li key={c.id} className="rounded-lg bg-slate-50 p-3">
                      <span className="font-mono text-[11px] text-brand">{c.id}</span>
                      <p className="mt-1 text-[13px] leading-relaxed text-ink">{c.text}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
