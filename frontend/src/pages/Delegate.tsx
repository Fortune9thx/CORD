/** Propose a narrower child of a grant you hold. */

import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { useHealth } from "../components/Chrome";
import { ClauseEditor, ExpiryInput, FormCard, TokenInput, TxButton, parseTokens, toUnix } from "../components/Forms";
import type { Clause } from "../components/Forms";
import { Empty, Section, Spinner, TokenList } from "../components/ui";
import { getGrant, write } from "../lib/chain";
import { MAX_DEPTH } from "../lib/limits";
import { fmtDate } from "../lib/format";
import type { Grant } from "../lib/types";

export default function Delegate() {
  const { id = "" } = useParams();
  const health = useHealth();
  const [parent, setParent] = useState<Grant | null | "missing">(null);

  const [grantee, setGrantee] = useState("");
  const [caps, setCaps] = useState("");
  const [res, setRes] = useState("");
  const [expiry, setExpiry] = useState("");
  const [clauses, setClauses] = useState<Clause[]>([{ id: "c1", text: "" }]);

  useEffect(() => {
    if (health.state !== "live") {
      setParent("missing");
      return;
    }
    getGrant(id)
      .then((g) => {
        setParent(g ?? "missing");
        if (g) {
          setCaps(g.capabilities.join(", "));
          setRes(g.resources.join(", "));
        }
      })
      .catch(() => setParent("missing"));
  }, [id, health.state]);

  if (parent === null) return <Section className="py-8"><Spinner /></Section>;
  if (parent === "missing")
    return (
      <Section className="py-8">
        <Empty title="Grant not readable" hint={`Nothing on chain answers to ${id}.`} />
      </Section>
    );

  const atDepthCap = parent.depth + 1 > MAX_DEPTH;
  const ready = Boolean(grantee.trim() && parseTokens(caps).length && parseTokens(res).length && expiry) && !atDepthCap;

  return (
    <Section className="py-8">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <FormCard
          title="Propose a narrower child"
          lead="Structured scope is checked deterministically the moment you submit. Anything that objectively widens the parent is rejected on the spot, without spending a validator's judgment."
        >
          <div>
            <p className="label">Grantee address</p>
            <input
              value={grantee}
              onChange={(e) => setGrantee(e.target.value)}
              placeholder="0x…"
              className="field font-mono text-[13px]"
            />
          </div>

          <TokenInput
            label="Capabilities"
            value={caps}
            onChange={setCaps}
            placeholder="payments.send"
            hint="Each must be covered by the parent's set. Remove what the child should not have."
          />
          <TokenInput
            label="Resources"
            value={res}
            onChange={setRes}
            placeholder="acct.ops"
            hint="Each must be covered by the parent's set."
          />

          <ExpiryInput value={expiry} onChange={setExpiry} max={parent.expiry} />

          <ClauseEditor clauses={clauses} onChange={setClauses} />

          {atDepthCap && (
            <p className="rounded-xl border border-rose-100 bg-rose-50 p-4 text-[13px] text-rose-900">
              This parent sits at depth {parent.depth}. A child would exceed the maximum
              delegation depth of {MAX_DEPTH}.
            </p>
          )}

          <TxButton
            disabled={!ready}
            onRun={() =>
              write("propose_child", [
                id,
                grantee.trim(),
                parseTokens(caps),
                parseTokens(res),
                toUnix(expiry),
                clauses.filter((c) => c.text.trim()),
              ])
            }
          >
            + Propose child
          </TxButton>

          <p className="text-[12px] leading-relaxed text-mute">
            A proposal confers no authority. It stays inactive until a bonded review settles it.
          </p>
        </FormCard>

        <div className="card h-fit p-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-mute">Parent</p>
          <p className="mt-2 font-mono text-[15px] font-bold text-ink">{parent.id}</p>

          <div className="mt-6 space-y-5">
            <div>
              <p className="label">Capabilities</p>
              <TokenList tokens={parent.capabilities} />
            </div>
            <div>
              <p className="label">Resources</p>
              <TokenList tokens={parent.resources} />
            </div>
            <div>
              <p className="label">Expires</p>
              <p className="text-sm text-ink">{fmtDate(parent.expiry)}</p>
            </div>
            <div>
              <p className="label">Clauses</p>
              {parent.clauses.length === 0 ? (
                <p className="text-sm text-slate-400">none</p>
              ) : (
                <ul className="space-y-2.5">
                  {parent.clauses.map((c) => (
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
